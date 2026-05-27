import { useState } from 'react'
import { Package, Plus, Pencil, Trash2, AlertCircle } from 'lucide-react'
import { toast } from 'react-toastify'
import { useProductos } from '../../hooks/useProductos'
import ProductoForm from '../../components/productos/ProductoForm'
import type { Producto } from '../../types/database'

export default function ProductosPage() {
  const { productos, loading, error, crearProducto, actualizarProducto, eliminarProducto } = useProductos()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)
  const [eliminando, setEliminando] = useState<number | null>(null)

  const abrirNuevo = () => {
    setProductoEditar(null)
    setModalAbierto(true)
  }

  const abrirEditar = (producto: Producto) => {
    setProductoEditar(producto)
    setModalAbierto(true)
  }

  const handleSubmit = async (values: Omit<Producto, 'id' | 'creado_en' | 'actualizado_en'>) => {
    try {
      if (productoEditar) {
        await actualizarProducto(productoEditar.id, values)
        toast.success('Producto actualizado')
      } else {
        await crearProducto(values)
        toast.success('Producto creado')
      }
      setModalAbierto(false)
      setProductoEditar(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
      throw e
    }
  }

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar este producto?')) return
    setEliminando(id)
    try {
      const result = await eliminarProducto(id)
      if (result.mode === 'deleted') {
        toast.success('Producto eliminado')
      } else {
        toast.info('El producto tiene movimientos y se marcó como inactivo')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setEliminando(null)
    }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Package className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Productos</h1>
        </div>
        <button
          onClick={abrirNuevo}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Nuevo producto
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando productos...</div>
        ) : productos.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-400 text-sm">No hay productos registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">SKU</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Código barras</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Costo</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Precio</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Stock mín.</th>
                <th className="text-center px-5 py-3 font-semibold text-gray-600">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productos.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{p.nombre}</td>
                  <td className="px-5 py-3 text-gray-500">{p.sku ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{p.codigo_barras ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-700">${Number(p.costo_actual).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">${Number(p.precio_actual).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{p.stock_minimo}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => abrirEditar(p)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleEliminar(p.id)}
                        disabled={eliminando === p.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalAbierto && (
        <ProductoForm
          producto={productoEditar}
          onClose={() => setModalAbierto(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
