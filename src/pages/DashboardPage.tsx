import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, LayoutDashboard, ShoppingCart, Receipt, TrendingUp, AlertCircle, Wallet, CheckCircle2, Percent } from 'lucide-react'
import { api } from '../lib/apiClient'
import { useAuth } from '../context/AuthContext'
import { useDashboard } from '../hooks/useDashboard'
import { useSystemConfig } from '../hooks/useSystemConfig'
import { formatDateTime } from '../lib/dateUtils'

type VentasMesResponse = {
  total: number
  sumTotal: number
  totalPagadas: number
}

type SemanaIngreso = {
  label: string
  rango: string
  ingresos: number
}

type EstadisticasMes = {
  totalVentas: number
  ingresos: number
  pagadas: number
  ticketPromedio: number
  semanas: SemanaIngreso[]
}

const estadisticasMesVacias: EstadisticasMes = { totalVentas: 0, ingresos: 0, pagadas: 0, ticketPromedio: 0, semanas: [] }

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function primerDiaMesStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

function hoyStr() {
  return toDateStr(new Date())
}

function rangoCorto(desde: Date, hasta: Date) {
  const mismosMes = desde.getMonth() === hasta.getMonth()
  const opcionesDia: Intl.DateTimeFormatOptions = { day: 'numeric' }
  const opcionesCompletas: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const desdeStr = desde.toLocaleDateString('es-MX', mismosMes ? opcionesDia : opcionesCompletas)
  const hastaStr = hasta.toLocaleDateString('es-MX', opcionesCompletas)
  return `${desdeStr} – ${hastaStr}`
}

function semanasDelMes(): { desde: Date; hasta: Date; label: string; rango: string }[] {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const semanas: { desde: Date; hasta: Date; label: string; rango: string }[] = []
  let inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  let numero = 1

  while (inicio <= hoy) {
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + 6)
    const finReal = fin < hoy ? fin : hoy

    semanas.push({ desde: inicio, hasta: finReal, label: `Sem ${numero}`, rango: rangoCorto(inicio, finReal) })

    inicio = new Date(inicio)
    inicio.setDate(inicio.getDate() + 7)
    numero += 1
  }

  return semanas
}

function formatCompactCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

export default function DashboardPage() {
  const { config } = useSystemConfig()
  const { user, isAdmin } = useAuth()
  const { stats, ultimasVentas, loading, error } = useDashboard()

  const [estadisticasMes, setEstadisticasMes] = useState<EstadisticasMes>(estadisticasMesVacias)
  const [mesLoading, setMesLoading] = useState(false)

  const cargarEstadisticasMes = useCallback(async () => {
    setMesLoading(true)
    try {
      const filtroUsuario: Record<string, string> = !isAdmin && user ? { usuario_id: String(user.id) } : {}

      const paramsMes = new URLSearchParams({
        page: '1',
        pageSize: '1',
        fechaDesde: primerDiaMesStr(),
        fechaHasta: hoyStr(),
        ...filtroUsuario,
      })

      const semanas = semanasDelMes()

      const [totalesMes, ...totalesSemanas] = await Promise.all([
        api.get<VentasMesResponse>(`/ventas?${paramsMes}`),
        ...semanas.map((semana) => {
          const params = new URLSearchParams({
            page: '1',
            pageSize: '1',
            fechaDesde: toDateStr(semana.desde),
            fechaHasta: toDateStr(semana.hasta),
            ...filtroUsuario,
          })
          return api.get<VentasMesResponse>(`/ventas?${params}`)
        }),
      ])

      setEstadisticasMes({
        totalVentas: totalesMes.total,
        ingresos: totalesMes.sumTotal,
        pagadas: totalesMes.totalPagadas,
        ticketPromedio: totalesMes.total > 0 ? totalesMes.sumTotal / totalesMes.total : 0,
        semanas: semanas.map((semana, i) => ({
          label: semana.label,
          rango: semana.rango,
          ingresos: totalesSemanas[i].sumTotal,
        })),
      })
    } catch {
      // no bloquea el dashboard si falla
    } finally {
      setMesLoading(false)
    }
  }, [isAdmin, user])

  useEffect(() => {
    cargarEstadisticasMes()

    const refreshMs = config.dashboardRefreshSeconds * 1000
    const interval = setInterval(() => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      cargarEstadisticasMes()
    }, refreshMs)

    return () => clearInterval(interval)
  }, [cargarEstadisticasMes, config.dashboardRefreshSeconds, config.pauseRefreshOnHiddenTab])

  const nombreMes = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  const mesCards = [
    { label: 'Ventas del mes', value: estadisticasMes.totalVentas.toString(), icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Ingresos del mes', value: `$${estadisticasMes.ingresos.toFixed(2)}`, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Ventas pagadas', value: estadisticasMes.pagadas.toString(), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ticket promedio', value: `$${estadisticasMes.ticketPromedio.toFixed(2)}`, icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  const maxIngresoSemana = Math.max(...estadisticasMes.semanas.map((s) => s.ingresos), 1)

  const statCards = [
    { label: 'Ventas hoy', value: stats.ventasHoy.toString(), icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Productos activos', value: stats.productosActivos.toString(), icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ingresos del día', value: `$${Number(stats.ingresoHoy).toFixed(2)}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Stock bajo', value: stats.stockBajo.toString(), icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="text-indigo-600" size={24} />
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{label}</p>
              <div className={`${bg} p-2 rounded-lg`}>
                <Icon className={color} size={18} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-800">Últimas ventas</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando...</div>
          ) : ultimasVentas.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No hay ventas registradas</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ultimasVentas.map((venta) => (
                <div key={venta.id} className="px-6 py-4 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{venta.folio}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{venta.usuario_nombre}</p>
                      {venta.productos.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {venta.productos.map((p, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px]">
                              <span className="font-medium">{p.cantidad}×</span>
                              <span className="truncate max-w-32">{p.nombre}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-800">${Number(venta.total).toFixed(2)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(venta.fecha_venta)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <CalendarRange size={16} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-800">Estadísticas del mes</h2>
            <span className="text-xs text-gray-400 capitalize">· {nombreMes}</span>
          </div>
          {mesLoading && estadisticasMes.totalVentas === 0 && estadisticasMes.ingresos === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 divide-x divide-y divide-gray-50">
                {mesCards.map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-gray-500">{label}</p>
                      <div className={`${bg} p-2 rounded-lg`}>
                        <Icon className={color} size={18} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {estadisticasMes.semanas.length > 0 && (
                <div className="border-t border-gray-100 p-5">
                  <p className="text-sm font-medium text-gray-700 mb-4">Ingresos por semana</p>
                  <div className="flex items-end gap-3">
                    {estadisticasMes.semanas.map((semana) => {
                      const pct = semana.ingresos > 0 ? Math.max((semana.ingresos / maxIngresoSemana) * 100, 4) : 0
                      return (
                        <div key={semana.label} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                          <span className="text-[11px] text-gray-500 font-medium truncate w-full text-center">
                            {formatCompactCurrency(semana.ingresos)}
                          </span>
                          <div className="relative group h-24 w-full flex items-end justify-center">
                            <div
                              tabIndex={0}
                              role="img"
                              aria-label={`${semana.label}, ${semana.rango}: ${formatCompactCurrency(semana.ingresos)}`}
                              style={{ height: `${pct}%` }}
                              className="w-5 max-w-6 rounded-t bg-indigo-500 group-hover:bg-indigo-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                            />
                            <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 z-10">
                              <span className="text-gray-300">{semana.rango}</span>{' '}
                              <span className="font-semibold">${semana.ingresos.toFixed(2)}</span>
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-400">{semana.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
