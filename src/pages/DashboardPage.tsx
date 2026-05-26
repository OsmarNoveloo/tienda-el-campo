import { LayoutDashboard, ShoppingCart, Receipt, TrendingUp, AlertCircle } from 'lucide-react'
import { useDashboard } from '../hooks/useDashboard'
import { useSystemConfig } from '../hooks/useSystemConfig'

export default function DashboardPage() {
  const { config } = useSystemConfig()
  const { stats, ultimasVentas, loading, error } = useDashboard()

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
                    <div>
                      <p className="text-sm font-medium text-gray-800">{venta.folio}</p>
                      <p className="text-xs text-gray-500 mt-1">{venta.usuario_nombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">${Number(venta.total).toFixed(2)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(venta.fecha_venta).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-800">Información del sistema</h2>
          </div>
          <div className="p-4 sm:p-6 space-y-4 text-sm">
            <div>
              <p className="text-gray-500 mb-2">Estado</p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                Sistema operativo
              </div>
            </div>
            <div>
              <p className="text-gray-500 mb-2">Versión</p>
              <p className="text-gray-800 font-medium">1.0.0</p>
            </div>
            <div>
              <p className="text-gray-500 mb-2">Última sincronización</p>
              <p className="text-gray-800 font-medium">Hace unos momentos</p>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-gray-600 text-xs">
                Los datos se actualizan cada {config.dashboardRefreshSeconds} segundos. Para refrescar manualmente, recarga la página.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
