import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import DashboardPage from '../pages/DashboardPage'
import PosPage from '../pages/pos/PosPage'
import VentasPage from '../pages/ventas/VentasPage'
import ProductosPage from '../pages/productos/ProductosPage'
import InventarioPage from '../pages/inventario/InventarioPage'
import ProveedoresPage from '../pages/proveedores/ProveedoresPage'
import ClientesPage from '../pages/clientes/ClientesPage'
import CreditosPage from '../pages/creditos/CreditosPage'
import CajaPage from '../pages/caja/CajaPage'
import ConfiguracionPage from '../pages/configuracion/ConfiguracionPage'
import UsuariosPage from '../pages/usuarios/UsuariosPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'pos', element: <PosPage /> },
      { path: 'ventas', element: <VentasPage /> },
      { path: 'productos', element: <ProductosPage /> },
      { path: 'inventario', element: <InventarioPage /> },
      { path: 'proveedores', element: <ProveedoresPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'creditos', element: <CreditosPage /> },
      { path: 'caja', element: <CajaPage /> },
      { path: 'usuarios-admin', element: <UsuariosPage /> },
      { path: 'configuracion', element: <ConfiguracionPage /> },
    ],
  },
])
