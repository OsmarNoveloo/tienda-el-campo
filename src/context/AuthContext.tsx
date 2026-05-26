import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { sha256Hex } from '../lib/security'

type AuthUser = {
  id: number
  rol_id: number
  nombre: string
  usuario: string
  rol_nombre: string
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AUTH_STORAGE_KEY = 'tienda-auth-user'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function normalizeRoleName(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase()
}

function roleLooksAdmin(roleName: string | null | undefined) {
  return normalizeRoleName(roleName).includes('admin')
}

function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }, [user])

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true)

    const { data, error } = await supabase
      .from('usuarios')
      .select('id,rol_id,nombre,usuario,password_hash,estado,roles(nombre)')
      .eq('usuario', username)
      .eq('estado', 'ACTIVO')
      .maybeSingle()

    if (error) {
      setLoading(false)
      throw new Error(error.message)
    }

    if (!data) {
      setLoading(false)
      throw new Error('Usuario o contrasena incorrectos')
    }

    const incomingHash = await sha256Hex(password)
    if (incomingHash !== data.password_hash) {
      setLoading(false)
      throw new Error('Usuario o contrasena incorrectos')
    }

    const rolesPayload = (data as any).roles
    const roleName = Array.isArray(rolesPayload)
      ? rolesPayload[0]?.nombre
      : rolesPayload?.nombre

    setUser({
      id: data.id,
      rol_id: data.rol_id,
      nombre: data.nombre,
      usuario: data.usuario,
      rol_nombre: roleName ?? 'Sin rol',
    })

    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: roleLooksAdmin(user?.rol_nombre),
      loading,
      login,
      logout,
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
