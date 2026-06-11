import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Warehouse, Plus, AlertCircle, RotateCcw, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { useInventario } from '../../hooks/useInventario'
import { formatDateTime } from '../../lib/dateUtils'
import type { TipoMovimiento, Producto } from '../../types/database'
import type { StockProducto } from '../../hooks/useInventario'

const STOCK_PAGE_SIZE_OPTIONS = [20, 50, 100]
const PRODUCTOS_FETCH_CHUNK = 1000

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
  const [tab, setTab] = useState<'movimientos' | 'stock'>('movimientos')
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
  const deferredStockSearch = useDeferredValue(stockSearchInput)

  const { movimientos, loading, error, crearMovimiento, loadStockPage, loadStockLowCount } = useInventario()

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
    const allProductos: Producto[] = []
    let from = 0

    while (true) {
      const to = from + PRODUCTOS_FETCH_CHUNK - 1
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre')
        .range(from, to)

      if (error) {
        toast.error(error.message)
        return
      }

      const rows = (data ?? []) as Producto[]
      allProductos.push(...rows)

      if (rows.length < PRODUCTOS_FETCH_CHUNK) break
      from += PRODUCTOS_FETCH_CHUNK
    }

    setProductos(allProductos)
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
          <td className="px-4 py-3 text-right font-semibold text-gray-800">{Number(s.stock_actual).toLocaleString('es-ES', { maximumFractionDigits: 3 })}</td>
          <td className="px-4 py-3 text-right text-gray-600">{Number(s.stock_minimo).toLocaleString('es-ES', { maximumFractionDigits: 3 })}</td>
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
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Warehouse className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:items-end gap-2">
          <button
            onClick={() => openMovimientoModal()}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            <Plus size={16} /> Registrar movimiento
          </button>

          {tab === 'stock' && stockLowGlobalCount > 0 && (
            <div className="inline-flex w-full sm:w-auto items-center justify-center sm:justify-start gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              <AlertCircle size={13} />
              <span className="font-medium">Stock bajo:</span>
              <span>{stockLowGlobalCount}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setTab('movimientos')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            tab === 'movimientos'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Movimientos
        </button>
        <button
          onClick={() => setTab('stock')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            tab === 'stock'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Stock
        </button>
      </div>

      {tab === 'movimientos' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Cargando movimientos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-215 text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Cantidad</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Usuario</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Observacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movimientos.map((mov) => (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 font-medium">{mov.producto_nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        mov.tipo === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700' :
                        mov.tipo === 'SALIDA' ? 'bg-red-50 text-red-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {mov.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{Number(mov.cantidad).toLocaleString('es-ES', { maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-3 text-gray-600">{mov.usuario_nombre}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDateTime(mov.fecha_movimiento)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{mov.observacion ?? '—'}</td>
                  </tr>
                ))}
                {!movimientos.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay movimientos registrados.</td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar producto</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={stockSearchInput}
                  onChange={(e) => {
                    setStockSearchInput(e.target.value)
                    setStockPage(1)
                  }}
                  placeholder="Nombre o codigo de barras (busca en todos)"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            {hasStockSearch ? (
              <>
                <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                  <div className="w-full lg:w-40">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad comun</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={quickCantidadInput}
                      onChange={(e) => setQuickCantidadInput(e.target.value)}
                      onBlur={() => {
                        if (quickCantidad === null) setQuickCantidadInput('1')
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="w-full lg:w-48">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select
                      value={quickTipo}
                      onChange={(e) => setQuickTipo(e.target.value as TipoMovimiento)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="ENTRADA">Entrada</option>
                      <option value="SALIDA">Salida</option>
                      <option value="AJUSTE">Ajuste</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-gray-500">Selecciona un producto y aplica la misma cantidad para registrar rapido. Mostrando {stock.length} de {stockTotal} productos.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {quickProductos.map((s) => (
                    <div key={s.producto_id} className="border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.producto_nombre}</p>
                        <p className="text-xs text-gray-500">Stock actual: {Number(s.stock_actual).toLocaleString('es-ES', { maximumFractionDigits: 3 })}</p>
                      </div>
                      <button
                        type="button"
                        disabled={quickSubmittingId === s.producto_id || quickCantidad === null}
                        onClick={() => registrarMovimientoRapido(s.producto_id)}
                        className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {quickSubmittingId === s.producto_id ? 'Guardando...' : 'Aplicar'}
                      </button>
                    </div>
                  ))}
                  {!quickProductos.length && (
                    <div className="col-span-full text-center text-sm text-gray-400 py-5">No se encontraron productos.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                Escribe un nombre o codigo de barras para mostrar la seleccion rapida de productos.
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {stockLoading ? (
              <div className="p-10 text-center text-sm text-gray-400">Cargando stock...</div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-190 text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock actual</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock mínimo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stockRows}
                  {!stock.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay productos para mostrar.</td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
                <p>Pagina {stockPage} de {totalPages} · {stockTotal} productos</p>
                <div className="flex items-center gap-2">
                  <select
                    value={stockPageSize}
                    onChange={(e) => {
                      setStockPageSize(Number(e.target.value))
                      setStockPage(1)
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                    aria-label="Productos por página"
                  >
                    {STOCK_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}/pag</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={stockPage <= 1}
                    onClick={() => setStockPage((prev) => Math.max(1, prev - 1))}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                    aria-label="Pagina anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-3 py-1 rounded-md bg-gray-50 border border-gray-200 text-xs font-medium text-gray-600">
                    {stockPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={stockPage >= totalPages}
                    onClick={() => setStockPage((prev) => Math.min(totalPages, prev + 1))}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                    aria-label="Pagina siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">
                Registrar movimiento{modalProductoNombre ? `: ${modalProductoNombre}` : ''}
              </h2>
            </div>

            <form onSubmit={handleSubmit(submitForm)} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
                <select {...register('producto_id')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value={0}>Selecciona un producto</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                {errors.producto_id && <p className="text-xs text-red-500 mt-1">{errors.producto_id.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de movimiento</label>
                <select {...register('tipo')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="ENTRADA">Entrada (compra/recepcion)</option>
                  <option value="SALIDA">Salida (venta)</option>
                  <option value="AJUSTE">Ajuste (correccion)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                <input {...register('cantidad')} autoFocus type="number" step="0.001" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {errors.cantidad && <p className="text-xs text-red-500 mt-1">{errors.cantidad.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Costo unitario (opcional)</label>
                <input {...register('costo_unitario')} type="number" step="0.01" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observacion</label>
                <textarea {...register('observacion')} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeMovimientoModal}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
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

