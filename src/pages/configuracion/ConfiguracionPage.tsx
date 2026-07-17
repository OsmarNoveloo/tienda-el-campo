import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, History, Laptop, Moon, RefreshCw, RotateCcw, Settings, Sun } from 'lucide-react'
import { toast } from 'react-toastify'
import { api } from '../../lib/apiClient'
import { formatDateTime } from '../../lib/dateUtils'
import { defaultAccessControl, useAccessControl } from '../../hooks/useAccessControl'
import { defaultSystemConfig, useSystemConfig } from '../../hooks/useSystemConfig'
import { useTheme } from '../../context/ThemeContext'
import type { RegistroActividad } from '../../types/database'

// const implementedSettings = [
//   'Dashboard: intervalo de actualización en segundos.',
//   'POS: refresco del resumen diario en segundos.',
//   'Créditos: refresco automático en segundos.',
//   'Inventario: límite de movimientos cargados.',
//   'Caja: límite de cortes en historial.',
//   'Control de ahorro: pausar refrescos en pestaña oculta.',
// ]

const themeOptions = [
  {
    mode: 'light',
    label: 'Claro',
    description: 'Ideal para ambientes bien iluminados.',
    Icon: Sun,
  },
  {
    mode: 'dark',
    label: 'Oscuro',
    description: 'Reduce brillo para trabajo nocturno.',
    Icon: Moon,
  },
  {
    mode: 'system',
    label: 'Sistema',
    description: 'Sigue la preferencia de tu dispositivo.',
    Icon: Laptop,
  },
] as const

const ACCION_LABELS: Record<string, string> = {
  USUARIO_CREADO: 'Usuario creado',
  USUARIO_ACTUALIZADO: 'Usuario actualizado',
  USUARIO_DESACTIVADO: 'Usuario desactivado',
  ACCESOS_ACTUALIZADOS: 'Permisos actualizados',
  PRODUCTO_CREADO: 'Producto creado',
  PRODUCTO_ACTUALIZADO: 'Producto actualizado',
  PRODUCTO_ELIMINADO: 'Producto eliminado',
  PRODUCTO_DESACTIVADO: 'Producto desactivado',
}

const ACT_PAGE_SIZE = 15

export default function ConfiguracionPage() {
  const { mode, resolvedTheme, setMode } = useTheme()
  const { config, updateConfig, resetConfig } = useSystemConfig()
  const {
    config: accessConfig,
    sections,
    updatePermission,
    resetAccessControl,
  } = useAccessControl()

  const [actividad, setActividad] = useState<RegistroActividad[]>([])
  const [actLoading, setActLoading] = useState(false)
  const [actPage, setActPage] = useState(1)
  const [actTotal, setActTotal] = useState(0)
  const actTotalPages = Math.max(1, Math.ceil(actTotal / ACT_PAGE_SIZE))

  const loadActividad = useCallback(async () => {
    setActLoading(true)
    try {
      const { items, total } = await api.get<{ items: RegistroActividad[]; total: number }>(
        `/actividad?page=${actPage}&pageSize=${ACT_PAGE_SIZE}`,
      )
      setActividad(items)
      setActTotal(total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error cargando el registro de actividad')
    } finally {
      setActLoading(false)
    }
  }, [actPage])

  useEffect(() => { loadActividad() }, [loadActividad])

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="text-indigo-600" size={24} />
        <h1 className="text-2xl font-bold text-gray-800">Configuración</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Ajusta preferencias globales del sistema.
      </p>

      <div className="grid grid-cols-1 gap-6">
        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Apariencia</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map(({ mode: themeMode, label, description, Icon }) => (
              <button
                key={themeMode}
                type="button"
                onClick={() => setMode(themeMode)}
                className={`text-left rounded-lg border p-3 transition-all ${
                  mode === themeMode
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className="text-indigo-600" />
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                </div>
                <p className="text-xs text-gray-500">{description}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Tema activo: <span className="font-semibold text-gray-700">{resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'}</span>
          </p>
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Configuración operativa</h2>
            <button
              type="button"
              onClick={resetConfig}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:border-indigo-200 hover:text-indigo-600"
            >
              <RotateCcw size={14} />
              Restablecer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Dashboard: refresco (segundos)</span>
              <input
                type="number"
                min={10}
                max={300}
                value={config.dashboardRefreshSeconds}
                onChange={(event) => updateConfig({ dashboardRefreshSeconds: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">POS: resumen diario (segundos)</span>
              <input
                type="number"
                min={10}
                max={180}
                value={config.posSummaryRefreshSeconds}
                onChange={(event) => updateConfig({ posSummaryRefreshSeconds: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Créditos: refresco (segundos)</span>
              <input
                type="number"
                min={10}
                max={180}
                value={config.creditosRefreshSeconds}
                onChange={(event) => updateConfig({ creditosRefreshSeconds: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Inventario: máximo movimientos</span>
              <input
                type="number"
                min={100}
                max={2000}
                value={config.inventarioMovimientosLimit}
                onChange={(event) => updateConfig({ inventarioMovimientosLimit: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Caja: máximo cortes en historial</span>
              <input
                type="number"
                min={50}
                max={1000}
                value={config.cajaHistorialLimit}
                onChange={(event) => updateConfig({ cajaHistorialLimit: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              />
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 mt-6 md:mt-0">
              <input
                type="checkbox"
                checked={config.pauseRefreshOnHiddenTab}
                onChange={(event) => updateConfig({ pauseRefreshOnHiddenTab: event.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm text-gray-700">Pausar refresco automático en pestaña oculta</span>
            </label>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Valores por defecto: Dashboard {defaultSystemConfig.dashboardRefreshSeconds}s, POS {defaultSystemConfig.posSummaryRefreshSeconds}s, Créditos {defaultSystemConfig.creditosRefreshSeconds}s.
          </p>

          {/* <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800 mb-2">Ya implementado en tu sistema</p>
          <ul className="space-y-2 text-sm text-gray-600">
            {implementedSettings.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          </div> */}
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Acceso por rol</h2>
            <button
              type="button"
              onClick={resetAccessControl}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:border-indigo-200 hover:text-indigo-600"
            >
              <RotateCcw size={14} />
              Restablecer accesos
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Define qué apartados ve cada rol en el menú y en el acceso por URL.
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-155 text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Apartado</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Admin</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Cajero</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sections.map((section) => {
                  const lockAdmin = section.protected
                  const lockCajero = section.protected

                  return (
                    <tr key={section.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{section.label}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={accessConfig.admin[section.key]}
                          disabled={lockAdmin}
                          onChange={(event) => updatePermission('admin', section.key, event.target.checked)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={accessConfig.cajero[section.key]}
                          disabled={lockCajero}
                          onChange={(event) => updatePermission('cajero', section.key, event.target.checked)}
                          className="h-4 w-4"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Protegidos por seguridad: Usuarios Admin y Configuración (solo admin). Predeterminado cajero: Dashboard {String(defaultAccessControl.cajero.dashboard)}, POS {String(defaultAccessControl.cajero.pos)}, Caja {String(defaultAccessControl.cajero.caja)}.
          </p>
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <History size={18} className="text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-800">Registro de actividad</h2>
            </div>
            <button
              type="button"
              onClick={loadActividad}
              disabled={actLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60"
            >
              <RefreshCw size={14} className={actLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Historial de cambios administrativos: usuarios, permisos y productos.
          </p>

          {actLoading && actividad.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Cargando actividad...</p>
          ) : actividad.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aún no hay actividad registrada.</p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {actividad.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                        {ACCION_LABELS[item.accion] ?? item.accion}
                      </span>
                      <span className="text-xs text-gray-500">{item.usuario_nombre}</span>
                    </div>
                    {item.detalle && (
                      <p className="text-sm text-gray-700 mt-1 truncate">{item.detalle}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                    {formatDateTime(item.creado_en)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {actTotal > 0 && (
            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
              <p>Página {actPage} de {actTotalPages} · {actTotal} registros</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActPage((p) => Math.max(1, p - 1))}
                  disabled={actPage <= 1}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setActPage((p) => Math.min(actTotalPages, p + 1))}
                  disabled={actPage >= actTotalPages}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Página siguiente"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
