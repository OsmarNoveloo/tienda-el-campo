import { Navigate } from 'react-router-dom'
import Layout from '../layout/Layout'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedLayout() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Layout />
}
