import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, LayoutDashboard, ShoppingCart, Receipt, TrendingUp, AlertCircle, Wallet, CheckCircle2, Percent } from 'lucide-react'
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

type PeriodoIngreso = {
  label: string
  rango: string
  ingresos: number
}

type EstadisticasMes = {
  totalVentas: number
  ingresos: number
  pagadas: number
  ticketPromedio: number
  semanas: PeriodoIngreso[]
}

type EstadisticasAnio = {
  totalVentas: number
  ingresos: number
  pagadas: number
  ticketPromedio: number
  meses: PeriodoIngreso[]
}

const estadisticasMesVacias: EstadisticasMes = { totalVentas: 0, ingresos: 0, pagadas: 0, ticketPromedio: 0, semanas: [] }
const estadisticasAnioVacias: EstadisticasAnio = { totalVentas: 0, ingresos: 0, pagadas: 0, ticketPromedio: 0, meses: [] }

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function primerDiaDeMes(mes: Date) {
  return new Date(mes.getFullYear(), mes.getMonth(), 1)
}

function ultimoDiaDeMes(mes: Date) {
  return new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
}

function esMesActual(mes: Date) {
  const hoy = new Date()
  return mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth()
}

function mesInputStr(mes: Date) {
  return `${mes.getFullYear()}-${pad(mes.getMonth() + 1)}`
}

function rangoFechasMes(mes: Date): { desde: Date; hasta: Date } {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const desde = primerDiaDeMes(mes)
  const hasta = esMesActual(mes) ? hoy : ultimoDiaDeMes(mes)
  return { desde, hasta }
}

function primerDiaDeAnio(anio: number) {
  return new Date(anio, 0, 1)
}

function ultimoDiaDeAnio(anio: number) {
  return new Date(anio, 11, 31)
}

function esAnioActual(anio: number) {
  return anio === new Date().getFullYear()
}

function rangoFechasAnio(anio: number): { desde: Date; hasta: Date } {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const desde = primerDiaDeAnio(anio)
  const hasta = esAnioActual(anio) ? hoy : ultimoDiaDeAnio(anio)
  return { desde, hasta }
}

function mesesDelAnio(anio: number): { desde: Date; hasta: Date; label: string; rango: string }[] {
  const { hasta: limite } = rangoFechasAnio(anio)

  const meses: { desde: Date; hasta: Date; label: string; rango: string }[] = []

  for (let m = 0; m <= 11; m++) {
    const inicio = new Date(anio, m, 1)
    if (inicio > limite) break

    const finMes = new Date(anio, m + 1, 0)
    const finReal = finMes < limite ? finMes : limite
    const label = inicio.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
    const rango = inicio.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

    meses.push({ desde: inicio, hasta: finReal, label, rango })
  }

  return meses
}

function rangoCorto(desde: Date, hasta: Date) {
  const mismosMes = desde.getMonth() === hasta.getMonth()
  const opcionesDia: Intl.DateTimeFormatOptions = { day: 'numeric' }
  const opcionesCompletas: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const desdeStr = desde.toLocaleDateString('es-MX', mismosMes ? opcionesDia : opcionesCompletas)
  const hastaStr = hasta.toLocaleDateString('es-MX', opcionesCompletas)
  return `${desdeStr} – ${hastaStr}`
}

function semanasDelMes(mes: Date): { desde: Date; hasta: Date; label: string; rango: string }[] {
  const { desde: inicioMes, hasta: limite } = rangoFechasMes(mes)

  const semanas: { desde: Date; hasta: Date; label: string; rango: string }[] = []
  let inicio = new Date(inicioMes)
  let numero = 1

  while (inicio <= limite) {
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + 6)
    const finReal = fin < limite ? fin : limite

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

  const [vista, setVista] = useState<'mes' | 'anio'>('mes')

  const [mesSeleccionado, setMesSeleccionado] = useState<Date>(() => primerDiaDeMes(new Date()))
  const [estadisticasMes, setEstadisticasMes] = useState<EstadisticasMes>(estadisticasMesVacias)
  const [mesLoading, setMesLoading] = useState(false)

  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(() => new Date().getFullYear())
  const [estadisticasAnio, setEstadisticasAnio] = useState<EstadisticasAnio>(estadisticasAnioVacias)
  const [anioLoading, setAnioLoading] = useState(false)

  const mesEsActual = useMemo(() => esMesActual(mesSeleccionado), [mesSeleccionado])
  const anioEsActual = useMemo(() => esAnioActual(anioSeleccionado), [anioSeleccionado])

  const irMesAnterior = useCallback(() => {
    setEstadisticasMes(estadisticasMesVacias)
    setMesSeleccionado((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const irMesSiguiente = useCallback(() => {
    setEstadisticasMes(estadisticasMesVacias)
    setMesSeleccionado((prev) => {
      const siguiente = new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      const limite = primerDiaDeMes(new Date())
      return siguiente > limite ? limite : siguiente
    })
  }, [])

  const cambiarMesInput = useCallback((valor: string) => {
    const [y, m] = valor.split('-').map(Number)
    if (!y || !m) return
    const limite = primerDiaDeMes(new Date())
    const seleccionado = new Date(y, m - 1, 1)
    setEstadisticasMes(estadisticasMesVacias)
    setMesSeleccionado(seleccionado > limite ? limite : seleccionado)
  }, [])

  const irAnioAnterior = useCallback(() => {
    setEstadisticasAnio(estadisticasAnioVacias)
    setAnioSeleccionado((prev) => prev - 1)
  }, [])

  const irAnioSiguiente = useCallback(() => {
    setEstadisticasAnio(estadisticasAnioVacias)
    setAnioSeleccionado((prev) => Math.min(prev + 1, new Date().getFullYear()))
  }, [])

  const cargarEstadisticasMes = useCallback(async () => {
    setMesLoading(true)
    try {
      const filtroUsuario: Record<string, string> = !isAdmin && user ? { usuario_id: String(user.id) } : {}
      const { desde: desdeMes, hasta: hastaMes } = rangoFechasMes(mesSeleccionado)

      const paramsMes = new URLSearchParams({
        page: '1',
        pageSize: '1',
        fechaDesde: toDateStr(desdeMes),
        fechaHasta: toDateStr(hastaMes),
        ...filtroUsuario,
      })

      const semanas = semanasDelMes(mesSeleccionado)

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
  }, [isAdmin, user, mesSeleccionado])

  const cargarEstadisticasAnio = useCallback(async () => {
    setAnioLoading(true)
    try {
      const filtroUsuario: Record<string, string> = !isAdmin && user ? { usuario_id: String(user.id) } : {}
      const { desde: desdeAnio, hasta: hastaAnio } = rangoFechasAnio(anioSeleccionado)

      const paramsAnio = new URLSearchParams({
        page: '1',
        pageSize: '1',
        fechaDesde: toDateStr(desdeAnio),
        fechaHasta: toDateStr(hastaAnio),
        ...filtroUsuario,
      })

      const meses = mesesDelAnio(anioSeleccionado)

      const [totalesAnio, ...totalesMeses] = await Promise.all([
        api.get<VentasMesResponse>(`/ventas?${paramsAnio}`),
        ...meses.map((mes) => {
          const params = new URLSearchParams({
            page: '1',
            pageSize: '1',
            fechaDesde: toDateStr(mes.desde),
            fechaHasta: toDateStr(mes.hasta),
            ...filtroUsuario,
          })
          return api.get<VentasMesResponse>(`/ventas?${params}`)
        }),
      ])

      setEstadisticasAnio({
        totalVentas: totalesAnio.total,
        ingresos: totalesAnio.sumTotal,
        pagadas: totalesAnio.totalPagadas,
        ticketPromedio: totalesAnio.total > 0 ? totalesAnio.sumTotal / totalesAnio.total : 0,
        meses: meses.map((mes, i) => ({
          label: mes.label,
          rango: mes.rango,
          ingresos: totalesMeses[i].sumTotal,
        })),
      })
    } catch {
      // no bloquea el dashboard si falla
    } finally {
      setAnioLoading(false)
    }
  }, [isAdmin, user, anioSeleccionado])

  useEffect(() => {
    if (vista !== 'mes') return

    cargarEstadisticasMes()

    if (!mesEsActual) return

    const refreshMs = config.dashboardRefreshSeconds * 1000
    const interval = setInterval(() => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      cargarEstadisticasMes()
    }, refreshMs)

    return () => clearInterval(interval)
  }, [vista, cargarEstadisticasMes, config.dashboardRefreshSeconds, config.pauseRefreshOnHiddenTab, mesEsActual])

  useEffect(() => {
    if (vista !== 'anio') return

    cargarEstadisticasAnio()

    if (!anioEsActual) return

    const refreshMs = config.dashboardRefreshSeconds * 1000
    const interval = setInterval(() => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      cargarEstadisticasAnio()
    }, refreshMs)

    return () => clearInterval(interval)
  }, [vista, cargarEstadisticasAnio, config.dashboardRefreshSeconds, config.pauseRefreshOnHiddenTab, anioEsActual])

  const nombreMes = mesSeleccionado.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  const estadisticasActivas = vista === 'mes' ? estadisticasMes : estadisticasAnio
  const periodos = vista === 'mes' ? estadisticasMes.semanas : estadisticasAnio.meses
  const cargandoActivo = vista === 'mes' ? mesLoading : anioLoading
  const sufijoPeriodo = vista === 'mes' ? 'del mes' : 'del año'
  const tituloGrafica = vista === 'mes' ? 'Ingresos por semana' : 'Ingresos por mes'

  const periodoCards = [
    { label: `Ventas ${sufijoPeriodo}`, value: estadisticasActivas.totalVentas.toString(), icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: `Ingresos ${sufijoPeriodo}`, value: `$${estadisticasActivas.ingresos.toFixed(2)}`, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Ventas pagadas', value: estadisticasActivas.pagadas.toString(), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ticket promedio', value: `$${estadisticasActivas.ticketPromedio.toFixed(2)}`, icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  const maxIngresoPeriodo = Math.max(...periodos.map((p) => p.ingresos), 1)

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
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarRange size={16} className="text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-800">
                Estadísticas {vista === 'mes' ? 'del mes' : 'del año'}
              </h2>
              <span className="text-xs text-gray-400 capitalize">
                · {vista === 'mes' ? nombreMes : anioSeleccionado}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setVista('mes')}
                  className={`px-2.5 py-1 rounded-md transition ${vista === 'mes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Mes
                </button>
                <button
                  type="button"
                  onClick={() => setVista('anio')}
                  className={`px-2.5 py-1 rounded-md transition ${vista === 'anio' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Año
                </button>
              </div>

              {vista === 'mes' ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={irMesAnterior}
                    aria-label="Mes anterior"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <label>
                    <span className="sr-only">Seleccionar mes</span>
                    <input
                      type="month"
                      value={mesInputStr(mesSeleccionado)}
                      max={mesInputStr(new Date())}
                      onChange={(e) => cambiarMesInput(e.target.value)}
                      className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={irMesSiguiente}
                    disabled={mesEsActual}
                    aria-label="Mes siguiente"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={irAnioAnterior}
                    aria-label="Año anterior"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1 min-w-14 text-center">
                    {anioSeleccionado}
                  </span>
                  <button
                    type="button"
                    onClick={irAnioSiguiente}
                    disabled={anioEsActual}
                    aria-label="Año siguiente"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
          {cargandoActivo && estadisticasActivas.totalVentas === 0 && estadisticasActivas.ingresos === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 divide-x divide-y divide-gray-50">
                {periodoCards.map(({ label, value, icon: Icon, color, bg }) => (
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

              {periodos.length > 0 && (
                <div className="border-t border-gray-100 p-5">
                  <p className="text-sm font-medium text-gray-700 mb-4">{tituloGrafica}</p>
                  <div className="flex items-end gap-3">
                    {periodos.map((periodo) => {
                      const pct = periodo.ingresos > 0 ? Math.max((periodo.ingresos / maxIngresoPeriodo) * 100, 4) : 0
                      return (
                        <div key={periodo.label} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                          <span className="text-[11px] text-gray-500 font-medium truncate w-full text-center">
                            {formatCompactCurrency(periodo.ingresos)}
                          </span>
                          <div className="relative group h-24 w-full flex items-end justify-center">
                            <div
                              tabIndex={0}
                              role="img"
                              aria-label={`${periodo.label}, ${periodo.rango}: ${formatCompactCurrency(periodo.ingresos)}`}
                              style={{ height: `${pct}%` }}
                              className="w-5 max-w-6 rounded-t bg-indigo-500 group-hover:bg-indigo-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                            />
                            <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 z-10">
                              <span className="text-gray-300">{periodo.rango}</span>{' '}
                              <span className="font-semibold">${periodo.ingresos.toFixed(2)}</span>
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-400 capitalize">{periodo.label}</span>
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
