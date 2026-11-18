import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { api, setToken, clearToken } from '../lib/apiClient'

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
  loginPerfil: (perfilId: number, password?: string) => Promise<void>
  logout: () => void
}

const AUTH_STORAGE_KEY = 'tienda-auth-user'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function roleLooksAdmin(roleName: string | null | undefined) {
  return (roleName ?? '').trim().toLowerCase().includes('admin')
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

  const iniciarSesion = useCallback(async (path: string, body: Record<string, unknown>) => {
    setLoading(true)
    try {
      const { token, user: authUser } = await api.post<{ token: string; user: AuthUser }>(path, body)
      setToken(token)
      setUser(authUser)
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser))
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(
    (username: string, password: string) => iniciarSesion('/auth/login', { usuario: username, password }),
    [iniciarSesion],
  )

  // Con contraseña (perfiles que la requieren, como el administrador) o con un toque (empleados)
  const loginPerfil = useCallback(
    (perfilId: number, password?: string) =>
      password
        ? iniciarSesion('/auth/login', { id: perfilId, password })
        : iniciarSesion('/auth/perfil-login', { id: perfilId }),
    [iniciarSesion],
  )

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: roleLooksAdmin(user?.rol_nombre),
      loading,
      login,
      loginPerfil,
      logout,
    }),
    [user, loading, login, loginPerfil, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
