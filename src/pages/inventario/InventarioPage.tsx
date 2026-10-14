import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Warehouse, Plus, AlertCircle, RotateCcw, Search, ChevronLeft, ChevronRight, ScanLine, History, Boxes, Camera } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/apiClient'
import { useInventario } from '../../hooks/useInventario'
import { formatDateTime } from '../../lib/dateUtils'
import type { TipoMovimiento, Producto } from '../../types/database'
import type { StockProducto } from '../../hooks/useInventario'
import ConteoRapido from './ConteoRapido'
import AgregarPiezasSheet from './AgregarPiezasSheet'
import BarcodeScanner from '../../components/common/BarcodeScanner'

const STOCK_PAGE_SIZE_OPTIONS = [20, 50, 100]

type InventarioTab = 'movimientos' | 'stock' | 'rapido'

const TABS = [
  { value: 'movimientos', label: 'Movimientos', icon: History },
  { value: 'stock', label: 'Stock', icon: Boxes },
  { value: 'rapido', label: 'Conteo rápido', icon: ScanLine },
] as const

const TIPO_STYLES: Record<TipoMovimiento, { badge: string; text: string; sign: string }> = {
  ENTRADA: { badge: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-600', sign: '+' },
  SALIDA: { badge: 'bg-red-50 text-red-700', text: 'text-red-600', sign: '−' },
  AJUSTE: { badge: 'bg-amber-50 text-amber-700', text: 'text-amber-600', sign: '' },
}

const TIPO_OPCIONES = [
  ['ENTRADA', 'Entrada', 'peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-700'],
  ['SALIDA', 'Salida', 'peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:text-red-700'],
  ['AJUSTE', 'Ajuste', 'peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-700'],
] as const

function formatCantidad(value: number) {
  return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 3 })
}

const schema = z.object({
  producto_id: z.coerce.number().positive('Selecciona un producto'),
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
  cantidad: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  costo_unitario: z.coerce.number().optional(),
  observacion: z.string().optional(),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const FORM_DEFAULT_VALUES: FormInput = {
  producto_id: 0,
  tipo: 'ENTRADA',
  cantidad: 0,
  costo_unitario: 0,
  observacion: '',
}

export default function InventarioPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<InventarioTab>('movimientos')
  const [modalOpen, setModalOpen] = useState(false)
  const [productos, setProductos] = useState<Producto[]>([])
  const [stock, setStock] = useState<StockProducto[]>([])
  const [stockTotal, setStockTotal] = useState(0)
  const [stockLowGlobalCount, setStockLowGlobalCount] = useState(0)
  const [stockPage, setStockPage] = useState(1)
  const [stockPageSize, setStockPageSize] = useState(20)
  const [stockSearchInput, setStockSearchInput] = useState('')
  const [stockLoading, setStockLoading] = useState(false)
  const [quickCantidadInput, setQuickCantidadInput] = useState('1')
  const [quickTipo, setQuickTipo] = useState<TipoMovimiento>('ENTRADA')
  const [quickSubmittingId, setQuickSubmittingId] = useState<number | null>(null)
  const [modalProductoNombre, setModalProductoNombre] = useState<string | null>(null)
  const [stockScannerOpen, setStockScannerOpen] = useState(false)
  const [piezasProducto, setPiezasProducto] = useState<StockProducto | null>(null)
  const [piezasGuardando, setPiezasGuardando] = useState(false)
  const deferredStockSearch = useDeferredValue(stockSearchInput)

  const {
    movimientos,
    loading,
    error,
    crearMovimiento,
    loadStockPage,
    loadStockLowCount,
    buscarPorCodigo,
    registrarLote,
  } = useInventario()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isValid } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: FORM_DEFAULT_VALUES,
  })

  const closeMovimientoModal = useCallback(() => {
    setModalOpen(false)
    setModalProductoNombre(null)
    reset(FORM_DEFAULT_VALUES)
  }, [reset])

  const openMovimientoModal = useCallback((producto?: StockProducto) => {
    const parsedQuickCantidad = Number(quickCantidadInput)
    const modalCantidad = Number.isFinite(parsedQuickCantidad) && parsedQuickCantidad > 0 && Number.isInteger(parsedQuickCantidad * 2)
      ? parsedQuickCantidad
      : 1

    if (producto) {
      reset({
        ...FORM_DEFAULT_VALUES,
        producto_id: producto.producto_id,
        tipo: quickTipo,
        cantidad: modalCantidad,
      })
      setModalProductoNombre(producto.producto_nombre)
    } else {
      setModalProductoNombre(null)
      reset(FORM_DEFAULT_VALUES)
    }

    setModalOpen(true)
  }, [quickCantidadInput, quickTipo, reset])

  const loadProductos = useCallback(async () => {
    try {
      const data = await api.get<Producto[]>('/productos')
      setProductos(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar productos')
    }
  }, [])

  const refreshStock = useCallback(async (showLoader = false) => {
    if (showLoader) setStockLoading(true)

    try {
      const { items, total } = await loadStockPage({
        page: stockPage,
        pageSize: stockPageSize,
        search: deferredStockSearch,
      })

      setStock(items)
      setStockTotal(total)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar stock')
    } finally {
      if (showLoader) setStockLoading(false)
    }
  }, [deferredStockSearch, loadStockPage, stockPage, stockPageSize])

  const refreshStockLowGlobalCount = useCallback(async () => {
    try {
      const count = await loadStockLowCount()
      setStockLowGlobalCount(count)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar stock bajo global')
    }
  }, [loadStockLowCount])

  const aplicarCambioStockLocal = useCallback((productoId: number, tipo: TipoMovimiento, cantidad: number) => {
    setStock((prev) => prev.map((item) => {
      if (item.producto_id !== productoId) return item

      const actual = Number(item.stock_actual)
      if (tipo === 'ENTRADA') return { ...item, stock_actual: actual + cantidad }
      if (tipo === 'SALIDA') return { ...item, stock_actual: actual - cantidad }

      return { ...item, stock_actual: cantidad }
    }))
  }, [])

  useEffect(() => {
    loadProductos()
  }, [loadProductos])

  useEffect(() => {
    if (tab === 'stock') {
      void refreshStock(true)
      void refreshStockLowGlobalCount()
    }
  }, [tab, refreshStock, refreshStockLowGlobalCount])

  const submitForm = async (values: FormOutput) => {
    if (!user) {
      toast.error('No hay sesión activa')
      return
    }

    try {
      await crearMovimiento({
        producto_id: values.producto_id,
        usuario_id: user.id,
        tipo: values.tipo as TipoMovimiento,
        cantidad: values.cantidad,
        costo_unitario: values.costo_unitario ?? null,
        referencia_tipo: null,
        referencia_id: null,
        observacion: values.observacion ?? null,
      })

      if (tab === 'stock') {
        await refreshStock(true)
        await refreshStockLowGlobalCount()
      }

      toast.success('Movimiento registrado')
      closeMovimientoModal()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar')
    }
  }

  const quickCantidad = useMemo(() => {
    const parsed = Number(quickCantidadInput)

    if (!Number.isFinite(parsed) || parsed <= 0) return null
    if (!Number.isInteger(parsed * 2)) return null

    return parsed
  }, [quickCantidadInput])

  const stockRows = useMemo(() => {
    return stock.map((s) => {
      const isLow = s.stock_actual <= s.stock_minimo

      return (
        <tr key={s.producto_id} className={`hover:bg-gray-50 ${isLow ? 'bg-amber-50' : ''}`}>
          <td className="px-4 py-3 text-gray-800 font-medium">{s.producto_nombre}</td>
          <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCantidad(s.stock_actual)}</td>
          <td className="px-4 py-3 text-right text-gray-600">{formatCantidad(s.stock_minimo)}</td>
          <td className="px-4 py-3 text-right text-gray-600">${Number(s.precio_actual).toFixed(2)}</td>
          <td className="px-4 py-3 text-center">
            {isLow ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                <AlertCircle size={12} /> Bajo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
                <RotateCcw size={12} /> OK
              </span>
            )}
          </td>
          <td className="px-4 py-3 text-right">
            <button
              type="button"
              onClick={() => openMovimientoModal(s)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
              title="Registrar movimiento"
              aria-label="Registrar movimiento"
            >
              <Plus size={14} />
            </button>
          </td>
        </tr>
      )
    })
  }, [openMovimientoModal, stock])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(stockTotal / stockPageSize))
  }, [stockPageSize, stockTotal])

  const hasStockSearch = useMemo(() => stockSearchInput.trim().length > 0, [stockSearchInput])

  const quickProductos = useMemo(() => stock.slice(0, 12), [stock])

  useEffect(() => {
    if (stockPage > totalPages) {
      setStockPage(totalPages)
    }
  }, [stockPage, totalPages])

  const abrirPorCodigo = async (raw: string) => {
    const codigo = raw.trim()
    if (!codigo) return

    try {
      const producto = await buscarPorCodigo(codigo)
      setPiezasProducto(producto)
    } catch {
      toast.warning(`No hay producto con el código ${codigo}`)
      setStockSearchInput(codigo)
      setStockPage(1)
    }
  }

  const agregarPiezas = async (cantidad: number, escanearOtro: boolean) => {
    if (!user || !piezasProducto) return

    setPiezasGuardando(true)
    try {
      await crearMovimiento({
        producto_id: piezasProducto.producto_id,
        usuario_id: user.id,
        tipo: 'ENTRADA',
        cantidad,
        costo_unitario: null,
        referencia_tipo: null,
        referencia_id: null,
        observacion: 'Entrada por escaneo',
      })
      toast.success(`+${formatCantidad(cantidad)} ${piezasProducto.producto_nombre}`)
      setPiezasProducto(null)
      if (escanearOtro) setStockScannerOpen(true)
      void refreshStock()
      void refreshStockLowGlobalCount()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al agregar piezas')
    } finally {
      setPiezasGuardando(false)
    }
  }

  const registrarMovimientoRapido = async (productoId: number) => {
    if (!user) {
      toast.error('No hay sesion activa')
      return
    }

    if (quickCantidad === null) {
      toast.error('Cantidad invalida. Usa enteros o valores en .5')
      return
    }

    const cantidad = quickCantidad
    const tipoSeleccionado = quickTipo
    const stockPrevio = stock

    setQuickSubmittingId(productoId)
    aplicarCambioStockLocal(productoId, tipoSeleccionado, cantidad)

    try {
      await crearMovimiento({
        producto_id: productoId,
        usuario_id: user.id,
        tipo: tipoSeleccionado,
        cantidad,
        costo_unitario: null,
        referencia_tipo: null,
        referencia_id: null,
        observacion: 'Registro rapido desde stock',
      })

      await refreshStock(true)
      await refreshStockLowGlobalCount()
      toast.success('Movimiento registrado rapido')
    } catch (e: unknown) {
      setStock(stockPrevio)
      toast.error(e instanceof Error ? e.message : 'Error al registrar movimiento')
    } finally {
      setQuickSubmittingId(null)
    }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Warehouse className="text-indigo-600 shrink-0" size={24} />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">Inventario</h1>
          {stockLowGlobalCount > 0 && (
            <button
              type="button"
              onClick={() => setTab('stock')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium"
              title="Productos con stock bajo"
            >
              <AlertCircle size={12} />
              {stockLowGlobalCount}
              <span className="hidden sm:inline">con stock bajo</span>
            </button>
          )}
        </div>
        <button
          onClick={() => openMovimientoModal()}
          className="shrink-0 inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Registrar movimiento</span>
          <span className="sm:hidden">Movimiento</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 sm:inline-grid gap-1 p-1 rounded-xl bg-gray-100 border border-gray-200">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-2 sm:px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === value
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Icon size={15} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'rapido' && (
        <ConteoRapido
          buscarPorCodigo={buscarPorCodigo}
          loadStockPage={loadStockPage}
          registrarLote={registrarLote}
          onApplied={() => void refreshStockLowGlobalCount()}
        />
      )}

      {tab === 'movimientos' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Cargando movimientos...</div>
          ) : !movimientos.length ? (
            <div className="p-10 text-center text-sm text-gray-400">No hay movimientos registrados.</div>
          ) : (
            <>
              {/* Celular y tablet vertical: tarjetas */}
              <ul className="md:hidden divide-y divide-gray-100">
                {movimientos.map((mov) => (
                  <li key={mov.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-gray-800 min-w-0 break-words">{mov.producto_nombre}</p>
                      <span className={`shrink-0 text-base font-bold ${TIPO_STYLES[mov.tipo].text}`}>
                        {TIPO_STYLES[mov.tipo].sign}{formatCantidad(mov.cantidad)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${TIPO_STYLES[mov.tipo].badge}`}>{mov.tipo}</span>
                      <span className="truncate">{mov.usuario_nombre}</span>
                      <span className="ml-auto shrink-0">{formatDateTime(mov.fecha_movimiento)}</span>
                    </div>
                    {mov.observacion && <p className="mt-1 text-xs text-gray-500">{mov.observacion}</p>}
                  </li>
                ))}
              </ul>

              {/* Tablet horizontal y escritorio: tabla */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipo</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Cantidad</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Usuario</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {movimientos.map((mov) => (
                      <tr key={mov.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium">
                          {mov.producto_nombre}
                          {mov.observacion && <p className="lg:hidden text-xs font-normal text-gray-500 mt-0.5">{mov.observacion}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_STYLES[mov.tipo].badge}`}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatCantidad(mov.cantidad)}</td>
                        <td className="px-4 py-3 text-gray-600">{mov.usuario_nombre}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{formatDateTime(mov.fecha_movimiento)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs hidden lg:table-cell">{mov.observacion ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4 space-y-3 sm:space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={stockSearchInput}
                  onChange={(e) => {
                    setStockSearchInput(e.target.value)
                    setStockPage(1)
                  }}
                  onKeyDown={(e) => {
                    // Un lector de códigos USB/Bluetooth escribe el código y manda Enter
                    if (e.key === 'Enter' && /^\d{6,}$/.test(stockSearchInput.trim())) {
                      e.preventDefault()
                      const codigo = stockSearchInput
                      setStockSearchInput('')
                      void abrirPorCodigo(codigo)
                    }
                  }}
                  enterKeyHint="search"
                  placeholder="Buscar por nombre o código de barras"
                  aria-label="Buscar producto"
                  className="w-full h-11 border border-gray-300 rounded-lg pl-9 pr-3 text-base sm:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setStockScannerOpen(true)}
                className="shrink-0 inline-flex items-center justify-center gap-2 h-11 px-3 sm:px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                aria-label="Escanear código con la cámara"
              >
                <Camera size={18} />
                <span className="hidden sm:inline">Escanear</span>
              </button>
            </div>

            {hasStockSearch ? (
              <>
                <div className="grid grid-cols-2 lg:flex lg:items-end gap-3">
                  <div className="lg:w-40">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Cantidad común</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.5"
                      step="0.5"
                      value={quickCantidadInput}
                      onChange={(e) => setQuickCantidadInput(e.target.value)}
                      onBlur={() => {
                        if (quickCantidad === null) setQuickCantidadInput('1')
                      }}
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-base sm:text-sm"
                    />
                  </div>

                  <div className="lg:w-48">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select
                      value={quickTipo}
                      onChange={(e) => setQuickTipo(e.target.value as TipoMovimiento)}
                      className="w-full h-11 border border-gray-300 rounded-lg px-3 text-base sm:text-sm"
                    >
                      <option value="ENTRADA">Entrada</option>
                      <option value="SALIDA">Salida</option>
                      <option value="AJUSTE">Ajuste</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-gray-500">Toca Aplicar en un producto para registrar la misma cantidad. Mostrando {quickProductos.length} de {stockTotal} productos.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {quickProductos.map((s) => (
                    <div key={s.producto_id} className="border border-gray-200 rounded-lg pl-3 pr-2 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.producto_nombre}</p>
                        <p className="text-xs text-gray-500">Stock: {formatCantidad(s.stock_actual)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={quickSubmittingId === s.producto_id || quickCantidad === null}
                        onClick={() => registrarMovimientoRapido(s.producto_id)}
                        className="shrink-0 h-10 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {quickSubmittingId === s.producto_id ? '...' : 'Aplicar'}
                      </button>
                    </div>
                  ))}
                  {!quickProductos.length && (
                    <div className="col-span-full text-center text-sm text-gray-400 py-5">No se encontraron productos.</div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Escribe un nombre o código para registrar movimientos rápidos. Para contar muchos productos usa{' '}
                <button type="button" onClick={() => setTab('rapido')} className="text-indigo-600 font-medium underline">Conteo rápido</button>.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {stockLoading ? (
              <div className="p-10 text-center text-sm text-gray-400">Cargando stock...</div>
            ) : !stock.length ? (
              <div className="p-10 text-center text-sm text-gray-400">No hay productos para mostrar.</div>
            ) : (
              <>
                {/* Celular y tablet: tarjetas */}
                <ul className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-100">
                  {stock.map((s) => {
                    const isLow = s.stock_actual <= s.stock_minimo
                    return (
                      <li key={s.producto_id} className="bg-white px-4 py-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800 truncate">{s.producto_nombre}</p>
                            {isLow && (
                              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[11px] rounded font-medium">
                                <AlertCircle size={11} /> Bajo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Mín. {formatCantidad(s.stock_minimo)} · ${Number(s.precio_actual).toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold leading-none ${isLow ? 'text-amber-600' : 'text-gray-800'}`}>{formatCantidad(s.stock_actual)}</p>
                          <p className="text-[11px] text-gray-500">en stock</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openMovimientoModal(s)}
                          className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                          aria-label={`Registrar movimiento de ${s.producto_nombre}`}
                        >
                          <Plus size={18} />
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {/* Escritorio: tabla */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock actual</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock mínimo</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stockRows}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 sm:px-4 py-3 text-sm text-gray-600">
              <p className="text-xs sm:text-sm">{stockTotal} productos</p>
              <div className="flex items-center gap-2">
                <select
                  value={stockPageSize}
                  onChange={(e) => {
                    setStockPageSize(Number(e.target.value))
                    setStockPage(1)
                  }}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                  aria-label="Productos por página"
                >
                  {STOCK_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}/pág</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={stockPage <= 1}
                  onClick={() => setStockPage((prev) => Math.max(1, prev - 1))}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs font-medium text-gray-600 tabular-nums">
                  {stockPage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={stockPage >= totalPages}
                  onClick={() => setStockPage((prev) => Math.min(totalPages, prev + 1))}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Página siguiente"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stockScannerOpen && (
        <BarcodeScanner
          title="Escanear para agregar piezas"
          onDetected={(codigo) => void abrirPorCodigo(codigo)}
          onClose={() => setStockScannerOpen(false)}
        />
      )}

      {piezasProducto && (
        <AgregarPiezasSheet
          key={piezasProducto.producto_id}
          producto={piezasProducto}
          guardando={piezasGuardando}
          onConfirm={(cantidad, escanearOtro) => void agregarPiezas(cantidad, escanearOtro)}
          onClose={() => setPiezasProducto(null)}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <button type="button" onClick={closeMovimientoModal} className="absolute inset-0 cursor-default" aria-label="Cerrar" />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] flex flex-col">
            <div className="px-5 pt-3 pb-3 border-b border-gray-100">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
              <p className="text-base font-semibold text-gray-800">Registrar movimiento</p>
              {modalProductoNombre && <p className="text-sm text-gray-500 truncate">{modalProductoNombre}</p>}
            </div>

            <form onSubmit={handleSubmit(submitForm)} className="flex flex-col min-h-0">
              <div className="p-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
                  <select {...register('producto_id')} className="w-full h-11 border border-gray-300 rounded-lg px-3 text-base sm:text-sm">
                    <option value={0}>Selecciona un producto</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  {errors.producto_id && <p className="text-xs text-red-500 mt-1">{errors.producto_id.message}</p>}
                </div>

                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-1">Tipo de movimiento</span>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPO_OPCIONES.map(([value, label, checkedClass]) => (
                      <label key={value} className="relative cursor-pointer">
                        <input {...register('tipo')} type="radio" value={value} className="peer sr-only" />
                        <span className={`flex h-11 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-600 ${checkedClass}`}>
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                    <input {...register('cantidad')} autoFocus type="number" inputMode="decimal" step="0.001" className="w-full h-11 border border-gray-300 rounded-lg px-3 text-base sm:text-sm" />
                    {errors.cantidad && <p className="text-xs text-red-500 mt-1">{errors.cantidad.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Costo unit. <span className="font-normal text-gray-400">(opc.)</span></label>
                    <input {...register('costo_unitario')} type="number" inputMode="decimal" step="0.01" className="w-full h-11 border border-gray-300 rounded-lg px-3 text-base sm:text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observación</label>
                  <textarea {...register('observacion')} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm resize-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 px-5 pt-3 border-t border-gray-100 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={closeMovimientoModal}
                  className="h-11 px-4 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="h-11 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSubmitting ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
