import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export type AppSection =
  | 'dashboard'
  | 'pos'
  | 'ventas'
  | 'productos'
  | 'inventario'
  | 'proveedores'
  | 'clientes'
  | 'creditos'
  | 'caja'
  | 'notas'
  | 'usuariosAdmin'
  | 'configuracion'

export type RoleKey = 'admin' | 'cajero'

type RolePermissions = Record<AppSection, boolean>

export type AccessControlConfig = {
  admin: RolePermissions
  cajero: RolePermissions
}

export type AccessControlSection = {
  key: AppSection
  label: string
  path: string
  protected: boolean
}

const ACCESS_CONTROL_STORAGE_KEY = 'tienda-access-control'

const protectedSections: AppSection[] = ['usuariosAdmin', 'configuracion']

export const accessControlSections: AccessControlSection[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', protected: false },
  { key: 'pos', label: 'Punto de Venta', path: '/pos', protected: false },
  { key: 'ventas', label: 'Ventas', path: '/ventas', protected: false },
  { key: 'productos', label: 'Productos', path: '/productos', protected: false },
  { key: 'inventario', label: 'Inventario', path: '/inventario', protected: false },
  { key: 'proveedores', label: 'Proveedores', path: '/proveedores', protected: false },
  { key: 'clientes', label: 'Clientes', path: '/clientes', protected: false },
  { key: 'creditos', label: 'Creditos', path: '/creditos', protected: false },
  { key: 'caja', label: 'Caja', path: '/caja', protected: false },
  { key: 'notas', label: 'Notas', path: '/notas', protected: false },
  { key: 'usuariosAdmin', label: 'Usuarios Admin', path: '/usuarios-admin', protected: true },
  { key: 'configuracion', label: 'Configuracion', path: '/configuracion', protected: true },
]

const sectionPathMap: Record<AppSection, string> = Object.fromEntries(
  accessControlSections.map((section) => [section.key, section.path]),
) as Record<AppSection, string>

const preferredLandingSections: AppSection[] = [
  'dashboard',
  'pos',
  'ventas',
  'caja',
  'inventario',
  'productos',
  'clientes',
  'creditos',
  'proveedores',
  'notas',
  'usuariosAdmin',
  'configuracion',
]

export const defaultAccessControl: AccessControlConfig = {
  admin: {
    dashboard: true,
    pos: true,
    ventas: true,
    productos: true,
    inventario: true,
    proveedores: true,
    clientes: true,
    creditos: true,
    caja: true,
    notas: true,
    usuariosAdmin: true,
    configuracion: true,
  },
  cajero: {
    dashboard: true,
    pos: true,
    ventas: true,
    productos: false,
    inventario: true,
    proveedores: false,
    clientes: true,
    creditos: true,
    caja: true,
    notas: true,
    usuariosAdmin: false,
    configuracion: false,
  },
}

function sanitizeRolePermissions(input: Partial<RolePermissions>, role: RoleKey): RolePermissions {
  const base = { ...defaultAccessControl[role] }

  for (const section of accessControlSections) {
    if (typeof input[section.key] === 'boolean') {
      base[section.key] = Boolean(input[section.key])
    }
  }

  // Keep sensitive screens always admin-only.
  for (const section of protectedSections) {
    base[section] = role === 'admin'
  }

  return base
}

function sanitizeAccessControlConfig(input: Partial<AccessControlConfig>): AccessControlConfig {
  return {
    admin: sanitizeRolePermissions(input.admin ?? {}, 'admin'),
    cajero: sanitizeRolePermissions(input.cajero ?? {}, 'cajero'),
  }
}

function getStoredAccessControl(): AccessControlConfig {
  if (typeof window === 'undefined') return defaultAccessControl

  const raw = window.localStorage.getItem(ACCESS_CONTROL_STORAGE_KEY)
  if (!raw) return defaultAccessControl

  try {
    const parsed = JSON.parse(raw) as Partial<AccessControlConfig>
    return sanitizeAccessControlConfig(parsed)
  } catch {
    return defaultAccessControl
  }
}

export function useAccessControl() {
  const { isAdmin } = useAuth()
  const activeRole: RoleKey = isAdmin ? 'admin' : 'cajero'

  const [config, setConfig] = useState<AccessControlConfig>(() => getStoredAccessControl())

  useEffect(() => {
    window.localStorage.setItem(ACCESS_CONTROL_STORAGE_KEY, JSON.stringify(config))
  }, [config])

  const updatePermission = useCallback((role: RoleKey, section: AppSection, allowed: boolean) => {
    setConfig((current) =>
      sanitizeAccessControlConfig({
        ...current,
        [role]: {
          ...current[role],
          [section]: allowed,
        },
      }),
    )
  }, [])

  const resetAccessControl = useCallback(() => {
    setConfig(defaultAccessControl)
  }, [])

  const canAccess = useCallback(
    (section: AppSection, roleOverride?: RoleKey) => {
      const role = roleOverride ?? activeRole
      return config[role][section]
    },
    [activeRole, config],
  )

  const getHomePathForRole = useCallback(
    (roleOverride?: RoleKey) => {
      const role = roleOverride ?? activeRole
      const firstAllowed = preferredLandingSections.find((section) => config[role][section])
      if (!firstAllowed) return '/login'
      return sectionPathMap[firstAllowed]
    },
    [activeRole, config],
  )

  return {
    config,
    activeRole,
    canAccess,
    updatePermission,
    resetAccessControl,
    getHomePathForRole,
    sections: accessControlSections,
  }
}
