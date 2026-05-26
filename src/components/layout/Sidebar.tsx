import { LayoutDashboard, ShoppingCart, Receipt, Package, Warehouse, Truck, Users, CreditCard, Banknote, Settings, Store, ShieldUser, NotebookPen } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAccessControl, type AppSection } from '../../hooks/useAccessControl'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' as AppSection },
  { to: '/pos', label: 'Punto de Venta', icon: ShoppingCart, section: 'pos' as AppSection },
  { to: '/ventas', label: 'Ventas', icon: Receipt, section: 'ventas' as AppSection },
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
}

export default function Sidebar({ className = '', onNavigate }: SidebarProps) {
  const { canAccess } = useAccessControl()

  return (
    <aside className={`w-60 min-h-screen bg-gray-900 flex flex-col shrink-0 ${className}`}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-700">
        <div className="bg-indigo-600 rounded-lg p-1.5">
          <Store className="text-white" size={20} />
        </div>
        <div className="leading-tight">
          <p className="text-white font-semibold text-sm">Tienda el Campo</p>
          <p className="text-gray-400 text-xs">Sistema de Gestión</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems
          .filter((item) => canAccess(item.section))
          .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-700">
        <p className="text-gray-500 text-xs">v1.0.0</p>
      </div>
    </aside>
  )
}
