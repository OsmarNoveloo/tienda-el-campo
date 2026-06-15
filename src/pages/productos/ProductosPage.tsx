import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Package, Plus, Pencil, Trash2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'react-toastify'
import { useProductos } from '../../hooks/useProductos'
import ProductoForm from '../../components/productos/ProductoForm'
import { includesNormalized, normalizeSearchText } from '../../lib/searchUtils'
import type { Producto } from '../../types/database'

export default function ProductosPage() {
  const PAGE_SIZE_OPTIONS = [20, 50, 100]
  const { productos, loading, error, crearProducto, actualizarProducto, eliminarProducto } = useProductos()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)
  const [eliminando, setEliminando] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const deferredBusqueda = useDeferredValue(busqueda)

  const productosFiltrados = useMemo(() => {
    const texto = normalizeSearchText(deferredBusqueda)

    return productos.filter((producto) => {
      const coincideBusqueda = !texto
        || includesNormalized(producto.nombre, texto)
        || includesNormalized(producto.sku ?? '', texto)
        || includesNormalized(producto.codigo_barras ?? '', texto)

      const coincideEstado = filtroEstado === 'todos'
        || (filtroEstado === 'activos' && producto.activo)
        || (filtroEstado === 'inactivos' && !producto.activo)

      return coincideBusqueda && coincideEstado
    })
  }, [deferredBusqueda, filtroEstado, productos])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(productosFiltrados.length / pageSize))
  }, [pageSize, productosFiltrados.length])

  const productosPaginados = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return productosFiltrados.slice(start, start + pageSize)
  }, [currentPage, pageSize, productosFiltrados])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)))
  }

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const abrirNuevo = () => {
    setProductoEditar(null)
    setModalAbierto(true)
  }

  const abrirEditar = (producto: Producto) => {
    setProductoEditar(producto)
    setModalAbierto(true)
  }

  const handleSubmit = async (values: Omit<Producto, 'id' | 'creado_en' | 'actualizado_en'>) => {
    const codigoBarras = values.codigo_barras?.trim()
    if (codigoBarras) {
      const existeCodigo = productos.some((producto) => {
        if (!producto.activo) return false
        if (producto.id === productoEditar?.id) return false
        return producto.codigo_barras?.trim() === codigoBarras
      })

      if (existeCodigo) {
        toast.warning('Ya existe un producto con ese codigo de barras')
        return
      }
    }

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
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Package className="text-indigo-600" size={24} />
            <h1 className="text-2xl font-bold text-gray-800">Productos</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-600">
              Total: {productos.length}
            </span>
            <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-indigo-700">
              Filtrados: {productosFiltrados.length}
            </span>
          </div>
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
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Buscar por nombre, SKU o código de barras"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <select
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value as 'todos' | 'activos' | 'inactivos')
                setCurrentPage(1)
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="todos">Todos los estados</option>
              <option value="activos">Solo activos</option>
              <option value="inactivos">Solo inactivos</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando productos...</div>
        ) : productos.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-400 text-sm">No hay productos registrados</p>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-400 text-sm">No se encontraron productos con esos filtros</p>
          </div>
        ) : (
          <>
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
              {productosPaginados.map((p) => (
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
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
            <p>Mostrando {productosPaginados.length} de {productosFiltrados.length} productos filtrados ({productos.length} totales)</p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                aria-label="Productos por página"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}/pag</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 py-1 text-xs rounded-md bg-gray-50 border border-gray-200">{currentPage}/{totalPages}</span>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                aria-label="Página siguiente"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          </>
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
