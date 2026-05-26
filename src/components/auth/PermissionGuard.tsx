import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAccessControl, type AppSection } from '../../hooks/useAccessControl'

export default function PermissionGuard({
  section,
  children,
}: {
  section: AppSection
  children: ReactNode
}) {
  const { isAuthenticated } = useAuth()
  const { canAccess, getHomePathForRole } = useAccessControl()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!canAccess(section)) {
    return <Navigate to={getHomePathForRole()} replace />
  }

  return <>{children}</>
}
