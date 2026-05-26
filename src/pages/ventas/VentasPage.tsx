import { useCallback, useEffect, useMemo, useState } from 'react'
import { Receipt, Search, RefreshCw } from 'lucide-react'
import { toast } from 'react-toastify'
import { supabase } from '../../lib/supabaseClient'
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
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const loadVentas = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('ventas')
      .select('id, folio, fecha_venta, total, estado, usuario_id')
      .order('fecha_venta', { ascending: false })
      .order('id', { ascending: false })
      .limit(200)

    if (error) {
      toast.error(`Error cargando ventas: ${error.message}`)
      setLoading(false)
      return
    }

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
  }, [])

  useEffect(() => {
    loadVentas()
  }, [loadVentas])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return
      loadVentas()
    }, 30000)

    return () => clearInterval(interval)
  }, [loadVentas])

  const ventasFiltradas = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return ventas

    return ventas.filter((v) => {
      const folio = v.folio.toLowerCase()
      const usuario = v.usuario_nombre.toLowerCase()
      return folio.includes(term) || usuario.includes(term)
    })
  }, [ventas, search])

  const totalMonto = useMemo(
    () => ventasFiltradas.reduce((acc, v) => acc + Number(v.total), 0),
    [ventasFiltradas],
  )

  const totalPagadas = useMemo(
    () => ventasFiltradas.filter((v) => v.estado === 'PAGADA').length,
    [ventasFiltradas],
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
          <p className="text-2xl font-bold text-gray-800">{ventasFiltradas.length}</p>
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por folio o usuario"
              className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-center text-gray-400">Cargando ventas...</div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="p-8 text-sm text-center text-gray-400">No hay ventas para mostrar.</div>
        ) : (
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
                {ventasFiltradas.map((venta) => (
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
        )}
      </div>
    </div>
  )
}
