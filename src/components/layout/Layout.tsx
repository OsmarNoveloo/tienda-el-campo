import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut, Menu, UserCircle2, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'

export default function Layout() {
  const { user, logout } = useAuth()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen md:h-screen bg-gray-100 overflow-x-hidden">
      <Sidebar className="hidden md:flex" />

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
          <button
            type="button"
            onClick={() => setMobileSidebarOpen((value) => !value)}
            className="inline-flex md:hidden items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
            aria-label={mobileSidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {mobileSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

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
