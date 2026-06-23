import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut, Menu, PanelLeftOpen, UserCircle2, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'

const SIDEBAR_PINNED_KEY = 'tienda-sidebar-pinned'
const SIDEBAR_COLLAPSED_KEY = 'tienda-sidebar-collapsed'

function getStoredBoolean(key: string, defaultValue: boolean) {
  if (typeof window === 'undefined') return defaultValue
  const stored = window.localStorage.getItem(key)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return defaultValue
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarPinned, setDesktopSidebarPinned] = useState(() => getStoredBoolean(SIDEBAR_PINNED_KEY, true))
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => getStoredBoolean(SIDEBAR_COLLAPSED_KEY, false))
  const [desktopFloatingOpen, setDesktopFloatingOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, String(desktopSidebarPinned))
  }, [desktopSidebarPinned])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(desktopSidebarCollapsed))
  }, [desktopSidebarCollapsed])

  const togglePinned = () => {
    setDesktopSidebarPinned((current) => {
      const next = !current
      if (next) setDesktopFloatingOpen(false)
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {desktopSidebarPinned && (
        <Sidebar
          className="hidden md:flex"
          collapsed={desktopSidebarCollapsed}
          pinned={desktopSidebarPinned}
          onToggleCollapse={() => setDesktopSidebarCollapsed((current) => !current)}
          onTogglePinned={togglePinned}
        />
      )}

      {!desktopSidebarPinned && desktopFloatingOpen && (
        <div className="fixed inset-0 z-40 hidden md:block">
          <button
            type="button"
            onClick={() => setDesktopFloatingOpen(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="Cerrar menú lateral"
          />
          <div className="relative z-50 h-full">
            <Sidebar
              onNavigate={() => setDesktopFloatingOpen(false)}
              collapsed={desktopSidebarCollapsed}
              pinned={desktopSidebarPinned}
              onToggleCollapse={() => setDesktopSidebarCollapsed((current) => !current)}
              onTogglePinned={togglePinned}
            />
          </div>
        </div>
      )}

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar menú"
          />
          <div className="relative z-50 h-full">
            <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="px-3 sm:px-4 md:px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen((value) => !value)}
              className="inline-flex md:hidden items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
              aria-label={mobileSidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {mobileSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {!desktopSidebarPinned && (
              <button
                type="button"
                onClick={() => setDesktopFloatingOpen((current) => !current)}
                className="hidden md:inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                title={desktopFloatingOpen ? 'Cerrar menú lateral' : 'Abrir menú lateral'}
                aria-label={desktopFloatingOpen ? 'Cerrar menú lateral' : 'Abrir menú lateral'}
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 bg-gray-50">
            <UserCircle2 className="text-indigo-600" size={20} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-gray-800">{user?.nombre ?? 'Sin sesión'}</p>
              <p className="text-xs text-gray-500">{user?.rol_nombre ?? 'Sin rol'}</p>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 hover:border-red-200 hover:text-red-600"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
