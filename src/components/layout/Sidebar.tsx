import { LayoutDashboard, ShoppingCart, CircleDollarSign, Package, Warehouse, Truck, Users, CreditCard, Banknote, Settings, Store, ShieldUser, NotebookPen, ChevronsLeft, Pin, PinOff } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAccessControl, type AppSection } from '../../hooks/useAccessControl'
import { version as appVersion } from '../../../package.json'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' as AppSection },
  { to: '/pos', label: 'Punto de Venta', icon: ShoppingCart, section: 'pos' as AppSection },
  { to: '/ventas', label: 'Ventas', icon: CircleDollarSign, section: 'ventas' as AppSection },
  { to: '/productos', label: 'Productos', icon: Package, section: 'productos' as AppSection },
  { to: '/inventario', label: 'Inventario', icon: Warehouse, section: 'inventario' as AppSection },
  { to: '/proveedores', label: 'Proveedores', icon: Truck, section: 'proveedores' as AppSection },
  { to: '/clientes', label: 'Clientes', icon: Users, section: 'clientes' as AppSection },
  { to: '/creditos', label: 'Créditos', icon: CreditCard, section: 'creditos' as AppSection },
  { to: '/caja', label: 'Caja', icon: Banknote, section: 'caja' as AppSection },
  { to: '/notas', label: 'Notas', icon: NotebookPen, section: 'notas' as AppSection },
  { to: '/usuarios-admin', label: 'Usuarios Admin', icon: ShieldUser, section: 'usuariosAdmin' as AppSection },
  { to: '/configuracion', label: 'Configuración', icon: Settings, section: 'configuracion' as AppSection },
]

type SidebarProps = {
  className?: string
  onNavigate?: () => void
  collapsed?: boolean
  pinned?: boolean
  onToggleCollapse?: () => void
  onTogglePinned?: () => void
}

export default function Sidebar({
  className = '',
  onNavigate,
  collapsed = false,
  pinned = true,
  onToggleCollapse,
  onTogglePinned,
}: SidebarProps) {
  const { canAccess } = useAccessControl()

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-60'} h-full bg-gray-900 flex flex-col shrink-0 transition-all duration-200 ${className}`}>
      {/* Brand */}
      <div className={`relative flex items-center justify-between ${collapsed ? 'px-2' : 'px-5'} py-5 border-b border-gray-700`}>
        <div className={`flex items-center min-w-0 ${collapsed ? '' : 'gap-3'}`}>
          <div className="bg-indigo-600 rounded-lg p-1.5">
            <Store className="text-white" size={20} />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-white font-semibold text-sm">Tienda el Campo</p>
              <p className="text-gray-400 text-xs">Sistema de Gestión</p>
            </div>
          )}
        </div>
        {onTogglePinned && !collapsed && (
          <button
            type="button"
            onClick={onTogglePinned}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800"
            title={pinned ? 'Desfijar menú' : 'Fijar menú'}
            aria-label={pinned ? 'Desfijar menú' : 'Fijar menú'}
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="absolute -right-3 top-1/2 z-20 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 shadow-md transition-all duration-200 hover:scale-105 hover:bg-gray-800 md:inline-flex"
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            <ChevronsLeft size={14} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 flex flex-col gap-0.5 scrollbar-none">
        {navItems
          .filter((item) => canAccess(item.section))
          .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className={`${collapsed ? 'inline-flex h-8 w-8 items-center justify-center rounded-md' : ''}`}>
                <Icon size={18} />
              </span>
              {!collapsed && label}
              {collapsed && (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
      </nav>

      {/* Footer */}
      <div className={`${collapsed ? 'px-2' : 'px-5'} py-4 border-t border-gray-700 flex flex-col gap-2`}>
        <p className="text-gray-500 text-xs text-center">v{appVersion}</p>
      </div>
    </aside>
  )
}
