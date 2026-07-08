import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Receipt, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react'
import { toast } from 'react-toastify'
import { api } from '../../lib/apiClient'
import { useAuth } from '../../context/AuthContext'
import { normalizeSearchText } from '../../lib/searchUtils'
import { formatDateTime } from '../../lib/dateUtils'
import type { EstadoVenta } from '../../types/database'

type VentaRow = {
  id: number
  folio: string
  fecha_venta: string
  total: number
  estado: EstadoVenta
  usuario_nombre: string
  observacion: string | null
}

type DetalleItem = {
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

function todayStr() {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function VentasPage() {
  const { user, isAdmin } = useAuth()
  const PAGE_SIZE_OPTIONS = [20, 50, 100]
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [sumTotal, setSumTotal] = useState(0)
  const [totalPagadas, setTotalPagadas] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [fechaDesde, setFechaDesde] = useState(todayStr())
  const [fechaHasta, setFechaHasta] = useState(todayStr())
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState<number | null>(null)
  const detalleCacheRef = useRef<Map<number, DetalleItem[]>>(new Map())
  const [detalleVersion, setDetalleVersion] = useState(0)
  const deferredSearch = useDeferredValue(search)

  const loadVentas = useCallback(async () => {
    setLoading(true)
    detalleCacheRef.current.clear()
    setExpandedId(null)

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
        ...(deferredSearch.trim() ? { search: normalizeSearchText(deferredSearch) } : {}),
        ...(fechaDesde ? { fechaDesde } : {}),
        ...(fechaHasta ? { fechaHasta } : {}),
        ...(!isAdmin && user ? { usuario_id: String(user.id) } : {}),
      })
      const { items, total, sumTotal, totalPagadas } = await api.get<{
        items: VentaRow[]
        total: number
        sumTotal: number
        totalPagadas: number
      }>(`/ventas?${params}`)
      setVentas(items)
      setTotalCount(total)
      setSumTotal(sumTotal)
      setTotalPagadas(totalPagadas)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error cargando ventas')
      setVentas([])
      setTotalCount(0)
      setSumTotal(0)
      setTotalPagadas(0)
    } finally {
      setLoading(false)
    }
  }, [currentPage, deferredSearch, pageSize, fechaDesde, fechaHasta, isAdmin, user])

  const loadDetalle = async (ventaId: number) => {
    if (detalleCacheRef.current.has(ventaId)) return
    setLoadingDetalle(ventaId)

    try {
      const venta = await api.get<{ detalle: Array<{ nombre: string; cantidad: number; precio_unitario: number; subtotal: number }> }>(
        `/ventas/${ventaId}`,
      )
      const items: DetalleItem[] = venta.detalle.map((d) => ({
        nombre: d.nombre,
        cantidad: Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario),
        subtotal: Number(d.subtotal),
      }))
      detalleCacheRef.current.set(ventaId, items)
      setDetalleVersion((v) => v + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error cargando detalle')
    } finally {
      setLoadingDetalle(null)
    }
  }

  const toggleExpand = async (ventaId: number) => {
    if (expandedId === ventaId) {
      setExpandedId(null)
      return
    }
    setExpandedId(ventaId)
    await loadDetalle(ventaId)
  }

  useEffect(() => {
    loadVentas()
  }, [loadVentas])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [pageSize, totalCount])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return
      loadVentas()
    }, 30000)
    return () => clearInterval(interval)
  }, [loadVentas])

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Ventas</h1>
        </div>
        <button
          onClick={loadVentas}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Registros</p>
          <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Pagadas</p>
          <p className="text-2xl font-bold text-emerald-700">{totalPagadas}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Monto total</p>
          <p className="text-2xl font-bold text-indigo-700">${sumTotal.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 space-y-3">
          {/* Filtro de fechas */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 flex-1">
              <CalendarDays size={15} className="text-gray-400 shrink-0" />
              <label className="text-xs text-gray-500 shrink-0">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => { setFechaDesde(e.target.value); setCurrentPage(1) }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <CalendarDays size={15} className="text-gray-400 shrink-0" />
              <label className="text-xs text-gray-500 shrink-0">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => { setFechaHasta(e.target.value); setCurrentPage(1) }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => { setFechaDesde(''); setFechaHasta(''); setCurrentPage(1) }}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
            >
              Ver todo
            </button>
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
              placeholder="Buscar por folio o usuario"
              className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-center text-gray-400">Cargando ventas...</div>
        ) : ventas.length === 0 ? (
          <div className="p-8 text-sm text-center text-gray-400">No hay ventas para mostrar.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-190 text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="w-8 px-3 py-3"></th>
                    <th className="text-left px-4 py-3 font-semibold">Folio</th>
                    <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                    {isAdmin && <th className="text-left px-4 py-3 font-semibold">Usuario</th>}
                    <th className="text-right px-4 py-3 font-semibold">Total</th>
                    <th className="text-center px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ventas.map((venta) => {
                    const isExpanded = expandedId === venta.id
                    const detalle = detalleCacheRef.current.get(venta.id)
                    const isLoadingThis = loadingDetalle === venta.id
                    // detalleVersion is used to trigger re-render when cache updates
                    void detalleVersion

                    return (
                      <>
                        <tr
                          key={venta.id}
                          className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-indigo-50/40' : ''}`}
                          onClick={() => toggleExpand(venta.id)}
                        >
                          <td className="px-3 py-3 text-gray-400">
                            {isLoadingThis
                              ? <RefreshCw size={13} className="animate-spin" />
                              : isExpanded
                                ? <ChevronUp size={13} />
                                : <ChevronDown size={13} />
                            }
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{venta.folio}</td>
                          <td className="px-4 py-3 text-gray-600">{formatDateTime(venta.fecha_venta)}</td>
                          {isAdmin && <td className="px-4 py-3 text-gray-600">{venta.usuario_nombre}</td>}
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">${Number(venta.total).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${venta.estado === 'PAGADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {venta.estado}
                            </span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${venta.id}-detalle`} className="bg-indigo-50/40">
                            <td colSpan={isAdmin ? 6 : 5} className="px-6 pb-4 pt-1">
                              {isLoadingThis || !detalle ? (
                                <p className="text-xs text-gray-400 py-2">Cargando productos...</p>
                              ) : detalle.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2">Sin productos registrados.</p>
                              ) : (
                                <div className="rounded-lg border border-indigo-100 overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-indigo-50 text-indigo-700">
                                      <tr>
                                        <th className="text-left px-3 py-2 font-semibold">Producto</th>
                                        <th className="text-right px-3 py-2 font-semibold">Cant.</th>
                                        <th className="text-right px-3 py-2 font-semibold">Precio</th>
                                        <th className="text-right px-3 py-2 font-semibold">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-indigo-50 bg-white">
                                      {detalle.map((item, i) => (
                                        <tr key={i}>
                                          <td className="px-3 py-2 text-gray-800 font-medium">{item.nombre}</td>
                                          <td className="px-3 py-2 text-right text-gray-600">{item.cantidad}</td>
                                          <td className="px-3 py-2 text-right text-gray-600">${item.precio_unitario.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right font-semibold text-gray-800">${item.subtotal.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {venta.observacion && (
                                    <p className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t border-indigo-100">
                                      {venta.observacion}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
              <p>Pagina {currentPage} de {totalPages} · {totalCount} ventas</p>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                  aria-label="Ventas por página"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}/pag</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-2 py-1 text-xs rounded-md bg-gray-50 border border-gray-200">{currentPage}/{totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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
    </div>
  )
}
