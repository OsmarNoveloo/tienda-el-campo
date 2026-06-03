import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Receipt, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'react-toastify'
import { supabase } from '../../lib/supabaseClient'
import { normalizeSearchText } from '../../lib/searchUtils'
import type { EstadoVenta } from '../../types/database'

type VentaRow = {
  id: number
  folio: string
  fecha_venta: string
  total: number
  estado: EstadoVenta
  usuario_nombre: string
}

export default function VentasPage() {
  const PAGE_SIZE_OPTIONS = [20, 50, 100]
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const deferredSearch = useDeferredValue(search)

  const loadVentas = useCallback(async () => {
    setLoading(true)

    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1
    const term = normalizeSearchText(deferredSearch)

    let matchedUsuarioIds: number[] = []
    if (term) {
      const { data: usuariosMatch, error: usuariosError } = await supabase
        .from('usuarios')
        .select('id')
        .ilike('nombre', `%${term}%`)
        .limit(1000)

      if (usuariosError) {
        toast.error(`Error buscando usuarios: ${usuariosError.message}`)
        setVentas([])
        setTotalCount(0)
        setLoading(false)
        return
      }

      matchedUsuarioIds = ((usuariosMatch ?? []) as Array<{ id: number }>).map((row) => row.id)
    }

    let query = supabase
      .from('ventas')
      .select('id, folio, fecha_venta, total, estado, usuario_id', { count: 'exact' })
      .order('fecha_venta', { ascending: false })
      .order('id', { ascending: false })

    if (term) {
      if (matchedUsuarioIds.length > 0) {
        query = query.or(`folio.ilike.%${term}%,usuario_id.in.(${matchedUsuarioIds.join(',')})`)
      } else {
        query = query.ilike('folio', `%${term}%`)
      }
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
      toast.error(`Error cargando ventas: ${error.message}`)
      setLoading(false)
      return
    }

    setTotalCount(count ?? 0)

    const usuarioIds = [...new Set((data ?? []).map((v: any) => v.usuario_id).filter(Boolean))] as number[]
    let usuarioMap = new Map<number, string>()

    if (usuarioIds.length > 0) {
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', usuarioIds)

      usuarioMap = new Map((usuariosData ?? []).map((u: any) => [u.id, u.nombre]))
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      folio: row.folio,
      fecha_venta: row.fecha_venta,
      total: Number(row.total),
      estado: row.estado as EstadoVenta,
      usuario_nombre: usuarioMap.get(row.usuario_id) ?? 'Sin usuario',
    }))

    setVentas(mapped)
    setLoading(false)
  }, [currentPage, deferredSearch, pageSize])

  useEffect(() => {
    loadVentas()
  }, [loadVentas])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [pageSize, totalCount])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return
      loadVentas()
    }, 30000)

    return () => clearInterval(interval)
  }, [loadVentas])

  const totalMonto = useMemo(
    () => ventas.reduce((acc, v) => acc + Number(v.total), 0),
    [ventas],
  )

  const totalPagadas = useMemo(
    () => ventas.filter((v) => v.estado === 'PAGADA').length,
    [ventas],
  )

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
          <p className="text-2xl font-bold text-indigo-700">${totalMonto.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
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
                  <th className="text-left px-4 py-3 font-semibold">Folio</th>
                  <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold">Usuario</th>
                  <th className="text-right px-4 py-3 font-semibold">Total</th>
                  <th className="text-center px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.map((venta) => (
                  <tr key={venta.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{venta.folio}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(venta.fecha_venta).toLocaleString('es-MX')}</td>
                    <td className="px-4 py-3 text-gray-600">{venta.usuario_nombre}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">${Number(venta.total).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${venta.estado === 'PAGADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {venta.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
            <p>Pagina {currentPage} de {totalPages} · {totalCount} ventas</p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
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
