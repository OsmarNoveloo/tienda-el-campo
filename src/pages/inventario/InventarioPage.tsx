import { useCallback, useEffect, useMemo, useState } from 'react'
import { Warehouse, Plus, AlertCircle, RotateCcw } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { supabase } from '../../lib/supabaseClient'
import { useInventario } from '../../hooks/useInventario'
import type { TipoMovimiento, Producto } from '../../types/database'
import type { StockProducto } from '../../hooks/useInventario'

const schema = z.object({
  producto_id: z.coerce.number().positive('Selecciona un producto'),
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
  cantidad: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  costo_unitario: z.coerce.number().optional(),
  observacion: z.string().optional(),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

export default function InventarioPage() {
  const [tab, setTab] = useState<'movimientos' | 'stock'>('movimientos')
  const [modalOpen, setModalOpen] = useState(false)
  const [productos, setProductos] = useState<Producto[]>([])
  const [usuarioId, setUsuarioId] = useState<number | null>(null)
  const [stock, setStock] = useState<StockProducto[]>([])
  const [stockLoading, setStockLoading] = useState(false)

  const { movimientos, loading, error, crearMovimiento, loadStockActual } = useInventario()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      producto_id: 0,
      tipo: 'ENTRADA',
      cantidad: 0,
      costo_unitario: 0,
      observacion: '',
    },
  })

  const loadProductos = useCallback(async () => {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      toast.error(error.message)
      return
    }
    setProductos((data ?? []) as Producto[])
  }, [])

  const loadUsuario = useCallback(async () => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id')
      .eq('estado', 'ACTIVO')
      .order('id')
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      toast.error('No hay usuario activo')
      return
    }
    setUsuarioId(data.id)
  }, [])

  useEffect(() => {
    loadProductos()
    loadUsuario()
  }, [loadProductos, loadUsuario])

  useEffect(() => {
    if (tab === 'stock') {
      setStockLoading(true)
      loadStockActual().then((data) => {
        setStock(data)
        setStockLoading(false)
      }).catch((e) => {
        toast.error(e.message)
        setStockLoading(false)
      })
    }
  }, [tab, loadStockActual])

  const submitForm = async (values: FormOutput) => {
    if (!usuarioId) {
      toast.error('No hay usuario activo')
      return
    }

    try {
      await crearMovimiento({
        producto_id: values.producto_id,
        usuario_id: usuarioId,
        tipo: values.tipo as TipoMovimiento,
        cantidad: values.cantidad,
        costo_unitario: values.costo_unitario ?? null,
        referencia_tipo: null,
        referencia_id: null,
        observacion: values.observacion ?? null,
      })
      toast.success('Movimiento registrado')
      setModalOpen(false)
      reset()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar')
    }
  }

  const stockAlerta = useMemo(
    () => stock.filter((s) => s.stock_actual <= s.stock_minimo),
    [stock],
  )

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Warehouse className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          <Plus size={16} /> Registrar movimiento
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
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
            <table className="w-full text-sm">
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
                    <td className="px-4 py-3 text-gray-600 text-xs">{new Date(mov.fecha_movimiento).toLocaleString('es-ES')}</td>
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
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-4">
          {stockAlerta.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-semibold text-amber-900 text-sm">Stock bajo</p>
                  <p className="text-amber-800 text-xs mt-1">{stockAlerta.length} productos por debajo del stock mínimo</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {stockLoading ? (
              <div className="p-10 text-center text-sm text-gray-400">Cargando stock...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock actual</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock mínimo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stock.map((s) => {
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
                      </tr>
                    )
                  })}
                  {!stock.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No hay productos para mostrar.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Registrar movimiento</h2>
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
                <input {...register('cantidad')} type="number" step="0.001" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
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

