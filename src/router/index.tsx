import { createBrowserRouter, Navigate } from 'react-router-dom'
import PermissionGuard from '../components/auth/PermissionGuard'
import ProtectedLayout from '../components/auth/ProtectedLayout'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/auth/LoginPage'
import PosPage from '../pages/pos/PosPage'
import VentasPage from '../pages/ventas/VentasPage'
import ProductosPage from '../pages/productos/ProductosPage'
import InventarioPage from '../pages/inventario/InventarioPage'
import ProveedoresPage from '../pages/proveedores/ProveedoresPage'
import ClientesPage from '../pages/clientes/ClientesPage'
import CreditosPage from '../pages/creditos/CreditosPage'
import CajaPage from '../pages/caja/CajaPage'
import ConfiguracionPage from '../pages/configuracion/ConfiguracionPage'
import NotasPage from '../pages/configuracion/NotasPage'
import UsuariosPage from '../pages/usuarios/UsuariosPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <PermissionGuard section="dashboard"><DashboardPage /></PermissionGuard> },
      { path: 'pos', element: <PermissionGuard section="pos"><PosPage /></PermissionGuard> },
      { path: 'ventas', element: <PermissionGuard section="ventas"><VentasPage /></PermissionGuard> },
      { path: 'productos', element: <PermissionGuard section="productos"><ProductosPage /></PermissionGuard> },
      { path: 'inventario', element: <PermissionGuard section="inventario"><InventarioPage /></PermissionGuard> },
      { path: 'proveedores', element: <PermissionGuard section="proveedores"><ProveedoresPage /></PermissionGuard> },
      { path: 'clientes', element: <PermissionGuard section="clientes"><ClientesPage /></PermissionGuard> },
      { path: 'creditos', element: <PermissionGuard section="creditos"><CreditosPage /></PermissionGuard> },
      { path: 'caja', element: <PermissionGuard section="caja"><CajaPage /></PermissionGuard> },
      { path: 'usuarios-admin', element: <PermissionGuard section="usuariosAdmin"><UsuariosPage /></PermissionGuard> },
      { path: 'configuracion', element: <PermissionGuard section="configuracion"><ConfiguracionPage /></PermissionGuard> },
      { path: 'notas', element: <PermissionGuard section="notas"><NotasPage /></PermissionGuard> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])
