import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Camera, ImagePlus, Minus, Plus, ScanLine, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { Html5Qrcode } from 'html5-qrcode'
import BarcodeScanner from '../../components/common/BarcodeScanner'
import { BARCODE_FORMATS, beep } from '../../lib/barcode'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import type { LoteResult, ModoLote, StockPageParams, StockPageResult, StockProducto } from '../../hooks/useInventario'

const STORAGE_KEY = 'inventario-conteo-rapido'
const PHOTO_REGION_ID = 'conteo-rapido-photo-region'

type ItemConteo = {
  producto_id: number
  nombre: string
  codigo: string | null
  stock_sistema: number
  cantidad: number
}

type SesionGuardada = {
  modo: ModoLote
  items: ItemConteo[]
}

interface Props {
  buscarPorCodigo: (codigo: string) => Promise<StockProducto>
  loadStockPage: (params: StockPageParams) => Promise<StockPageResult>
  registrarLote: (payload: {
    modo: ModoLote
    items: { producto_id: number; cantidad: number }[]
    observacion?: string | null
  }) => Promise<LoteResult>
  onApplied: () => void
}

function leerSesion(): SesionGuardada | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SesionGuardada
    return Array.isArray(parsed.items) ? parsed : null
  } catch {
    return null
  }
}

function formatCantidad(value: number) {
  return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 3 })
}

export default function ConteoRapido({ buscarPorCodigo, loadStockPage, registrarLote, onApplied }: Props) {
  "use no memo"
  const sesionInicial = useMemo(() => leerSesion(), [])
  const [modo, setModo] = useState<ModoLote>(sesionInicial?.modo ?? 'CONTEO')
  const [items, setItems] = useState<ItemConteo[]>(sesionInicial?.items ?? [])
  const [codigoInput, setCodigoInput] = useState('')
  const [porEscaneoInput, setPorEscaneoInput] = useState('1')
  const [sugerencias, setSugerencias] = useState<StockProducto[]>([])
  const [noEncontrados, setNoEncontrados] = useState<string[]>([])
  const [ultimoId, setUltimoId] = useState<number | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'aplicar' | 'limpiar' | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Cache de códigos ya consultados para que escanear el mismo producto sea instantáneo
  const cacheRef = useRef(new Map<string, StockProducto>())
  // Las lecturas se procesan en orden, una a la vez, para no duplicar productos nuevos
  const colaRef = useRef<Promise<void>>(Promise.resolve())

  const porEscaneo = useMemo(() => {
    const parsed = Number(porEscaneoInput)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  }, [porEscaneoInput])

  useEffect(() => {
    try {
      if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ modo, items }))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Sin almacenamiento disponible, la sesión solo vive en memoria
    }
  }, [modo, items])

  const enfocarInput = () => {
    // En celular no se enfoca para no abrir el teclado encima de la lista
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
  }

  useEffect(() => {
    enfocarInput()
  }, [])

  const agregarProducto = (producto: StockProducto, codigo: string | null) => {
    setItems((prev) => {
      const existente = prev.find((i) => i.producto_id === producto.producto_id)
      if (existente) {
        const actualizado = { ...existente, cantidad: Number((existente.cantidad + porEscaneo).toFixed(3)) }
        return [actualizado, ...prev.filter((i) => i.producto_id !== producto.producto_id)]
      }
      return [{
        producto_id: producto.producto_id,
        nombre: producto.producto_nombre,
        codigo: codigo ?? producto.codigo_barras ?? null,
        stock_sistema: Number(producto.stock_actual),
        cantidad: porEscaneo,
      }, ...prev]
    })
    setUltimoId(producto.producto_id)
    setSugerencias([])
  }

  const procesarCodigo = async (raw: string) => {
    const codigo = raw.trim()
    if (!codigo) return

    const cacheado = cacheRef.current.get(codigo)
    if (cacheado) {
      agregarProducto(cacheado, codigo)
      return
    }

    setBuscando(true)
    try {
      const producto = await buscarPorCodigo(codigo)
      cacheRef.current.set(codigo, producto)
      agregarProducto(producto, codigo)
    } catch {
      // No es un código conocido: intenta por nombre para elegir a mano
      try {
        const { items: encontrados } = await loadStockPage({ page: 1, pageSize: 8, search: codigo })
        if (encontrados.length === 1 && !/^\d+$/.test(codigo)) {
          agregarProducto(encontrados[0], null)
        } else if (encontrados.length) {
          setSugerencias(encontrados)
        } else {
          setSugerencias([])
          setNoEncontrados((prev) => (prev.includes(codigo) ? prev : [codigo, ...prev]))
          navigator.vibrate?.([80, 60, 80])
          toast.warning(`Sin producto para "${codigo}"`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al buscar el producto')
      }
    } finally {
      setBuscando(false)
    }
  }

  const encolarCodigo = (codigo: string) => {
    colaRef.current = colaRef.current.then(() => procesarCodigo(codigo))
  }

  const submitCodigo = (e: FormEvent) => {
    e.preventDefault()
    const codigo = codigoInput
    setCodigoInput('')
    encolarCodigo(codigo)
  }

  const escanearFoto = async (file: File) => {
    const lector = new Html5Qrcode(PHOTO_REGION_ID, { formatsToSupport: BARCODE_FORMATS, verbose: false })
    try {
      const codigo = await lector.scanFile(file, false)
      beep()
      encolarCodigo(codigo)
    } catch {
      toast.error('No se detectó un código en la foto. Acércate más y que no salga borroso.')
    } finally {
      try { lector.clear() } catch { /* ignorar */ }
    }
  }

  const cambiarCantidad = (productoId: number, cantidad: number) => {
    setItems((prev) => prev.map((i) => (
      i.producto_id === productoId ? { ...i, cantidad: Math.max(0, Number(cantidad.toFixed(3))) } : i
    )))
  }

  const quitarItem = (productoId: number) => {
    setItems((prev) => prev.filter((i) => i.producto_id !== productoId))
  }

  const limpiar = () => {
    setItems([])
    setNoEncontrados([])
    setSugerencias([])
    setUltimoId(null)
    cacheRef.current.clear()
  }

  const resumen = useMemo(() => {
    const totalPiezas = items.reduce((acc, i) => acc + i.cantidad, 0)
    const conDiferencia = items.filter((i) => i.cantidad !== i.stock_sistema).length
    return { totalPiezas, conDiferencia }
  }, [items])

  const aplicar = async () => {
    setConfirmAction(null)
    const payloadItems = items
      .filter((i) => modo === 'CONTEO' || i.cantidad > 0)
      .map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }))

    if (!payloadItems.length) {
      toast.error('No hay cantidades para registrar')
      return
    }

    setGuardando(true)
    try {
      const { registrados, sinCambios } = await registrarLote({ modo, items: payloadItems })
      toast.success(modo === 'CONTEO'
        ? `Conteo aplicado: ${registrados} productos ajustados, ${sinCambios} sin diferencia`
        : `Entrada registrada para ${registrados} productos`)
      limpiar()
      onApplied()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar el inventario')
    } finally {
      setGuardando(false)
    }
  }

  const ultimo = items.find((i) => i.producto_id === ultimoId) ?? null

  const resumenTexto = (
    <p className="text-sm text-gray-600">
      <span className="font-semibold text-gray-800">{items.length}</span> productos ·{' '}
      <span className="font-semibold text-gray-800">{formatCantidad(resumen.totalPiezas)}</span> pzs
      {modo === 'CONTEO' && <> · <span className="font-semibold text-amber-700">{resumen.conDiferencia}</span> dif.</>}
    </p>
  )

  const botonesAccion = (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!items.length || guardando}
        onClick={() => setConfirmAction('limpiar')}
        className="h-11 px-4 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
      >
        Limpiar
      </button>
      <button
        type="button"
        disabled={!items.length || guardando}
        onClick={() => setConfirmAction('aplicar')}
        className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <CheckCircle2 size={16} />
        {guardando ? 'Guardando...' : modo === 'CONTEO' ? 'Aplicar conteo' : 'Registrar entrada'}
      </button>
    </div>
  )

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-4">
      <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4 space-y-3 sm:space-y-4 lg:sticky lg:top-0">
        <div className="grid grid-cols-2 gap-2">
          {([
            ['CONTEO', 'Conteo físico', 'Corrige el sistema con lo que hay'],
            ['ENTRADA', 'Recibir mercancía', 'Suma lo escaneado al stock'],
          ] as const).map(([value, label, help]) => (
            <button
              key={value}
              type="button"
              disabled={items.length > 0 && modo !== value}
              onClick={() => setModo(value)}
              title={items.length > 0 && modo !== value ? 'Aplica o limpia la lista para cambiar de modo' : undefined}
              className={`text-left rounded-lg border-2 px-3 py-2 transition-colors disabled:opacity-40 ${
                modo === value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <p className={`text-sm font-semibold ${modo === value ? 'text-indigo-700' : 'text-gray-700'}`}>{label}</p>
              <p className="text-xs text-gray-500 leading-snug">{help}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-[0.98] transition-transform"
          >
            <Camera size={22} /> Escanear
          </button>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 active:scale-[0.98] transition-transform"
          >
            <ImagePlus size={22} /> Tomar foto
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void escanearFoto(file)
            }}
          />
          <div id={PHOTO_REGION_ID} className="hidden" />
        </div>

        <form onSubmit={submitCodigo} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value)}
                placeholder="Código o nombre"
                autoComplete="off"
                enterKeyHint="search"
                aria-label="Código de barras o nombre del producto"
                className="w-full h-11 border border-gray-300 rounded-lg pl-9 pr-3 text-base sm:text-sm"
              />
            </div>
            <button type="submit" disabled={buscando} className="shrink-0 h-11 px-4 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 disabled:opacity-60">
              {buscando ? '...' : 'Agregar'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">También funciona con lector USB o Bluetooth.</p>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
              Pzs/lectura
              <input
                type="number"
                inputMode="decimal"
                min="0.001"
                step="any"
                value={porEscaneoInput}
                onChange={(e) => setPorEscaneoInput(e.target.value)}
                onBlur={() => { if (Number(porEscaneoInput) <= 0) setPorEscaneoInput('1') }}
                className="w-16 h-9 border border-gray-300 rounded-lg px-2 text-center text-base sm:text-sm"
              />
            </label>
          </div>
        </form>

        {sugerencias.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">¿Cuál de estos productos?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s.producto_id}
                  type="button"
                  onClick={() => { agregarProducto(s, null); enfocarInput() }}
                  className="text-left border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-indigo-50 hover:border-indigo-200"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{s.producto_nombre}</p>
                  <p className="text-xs text-gray-500">Stock sistema: {formatCantidad(s.stock_actual)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {noEncontrados.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
            <AlertCircle size={13} />
            <span className="font-medium">Sin producto (regístralos en Productos):</span>
            {noEncontrados.map((c) => (
              <span key={c} className="px-1.5 py-0.5 rounded bg-white border border-amber-200 font-mono">{c}</span>
            ))}
            <button type="button" onClick={() => setNoEncontrados([])} className="ml-auto underline py-1">Ocultar</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="hidden md:flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          {resumenTexto}
          {botonesAccion}
        </div>
        <div className="md:hidden px-4 py-2.5 border-b border-gray-100">
          {resumenTexto}
        </div>

        {!items.length ? (
          <div className="px-6 py-12 text-center">
            <ScanLine size={32} className="mx-auto text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">Escanea productos con la cámara, una foto o el lector de códigos para empezar.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => {
              const diferencia = Number((item.cantidad - item.stock_sistema).toFixed(3))
              return (
                <li
                  key={item.producto_id}
                  className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-l-4 ${
                    item.producto_id === ultimoId ? 'border-l-indigo-500' : 'border-l-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2 sm:truncate">{item.nombre}</p>
                    <p className="text-xs text-gray-500">
                      Sistema: {formatCantidad(item.stock_sistema)}
                      {modo === 'CONTEO' ? (
                        diferencia !== 0 && (
                          <span className={`ml-2 font-semibold ${diferencia > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {diferencia > 0 ? '+' : ''}{formatCantidad(diferencia)}
                          </span>
                        )
                      ) : (
                        <span className="ml-2 text-emerald-600 font-semibold">→ {formatCantidad(item.stock_sistema + item.cantidad)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(item.producto_id, item.cantidad - 1)}
                      className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
                      aria-label="Restar uno"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.producto_id, Number(e.target.value) || 0)}
                      className="flex-1 sm:flex-none sm:w-20 min-w-0 h-11 sm:h-10 border border-gray-300 rounded-lg px-2 text-center text-base font-semibold"
                      aria-label={modo === 'CONTEO' ? 'Cantidad contada' : 'Cantidad recibida'}
                    />
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(item.producto_id, item.cantidad + 1)}
                      className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
                      aria-label="Sumar uno"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => quitarItem(item.producto_id)}
                      className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                      aria-label="Quitar de la lista"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Celular: acciones siempre a la mano mientras se escanea */}
      {items.length > 0 && (
        <div className="md:hidden sticky bottom-0 z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          {botonesAccion}
        </div>
      )}

      {cameraOpen && (
        <BarcodeScanner
          continuous
          title={modo === 'CONTEO' ? 'Conteo físico' : 'Recibir mercancía'}
          onDetected={encolarCodigo}
          onClose={() => { setCameraOpen(false); enfocarInput() }}
          footer={ultimo && (
            <div className="mt-3 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-indigo-800 truncate">{ultimo.nombre}</p>
              <p className="text-sm font-bold text-indigo-700 shrink-0">× {formatCantidad(ultimo.cantidad)}</p>
            </div>
          )}
        />
      )}

      {confirmAction === 'aplicar' && (
        <ConfirmDialog
          title={modo === 'CONTEO' ? 'Aplicar conteo físico' : 'Registrar entrada'}
          description={modo === 'CONTEO'
            ? `El stock de ${items.length} productos quedará igual a lo contado (${resumen.conDiferencia} con diferencia). Los productos que no escaneaste no se modifican.`
            : `Se sumarán ${formatCantidad(resumen.totalPiezas)} piezas a ${items.length} productos.`}
          confirmLabel="Sí, aplicar"
          onConfirm={() => void aplicar()}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'limpiar' && (
        <ConfirmDialog
          title="Limpiar lista"
          description="Se borrarán los productos escaneados sin registrar nada."
          confirmLabel="Sí, limpiar"
          onConfirm={() => { limpiar(); setConfirmAction(null) }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
