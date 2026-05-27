import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabaseClient'

type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const THEME_STORAGE_KEY = 'tienda-theme-mode'
const THEME_CONFIG_SOURCE = (import.meta.env.VITE_THEME_CONFIG_SOURCE as string | undefined)?.trim() || 'configuracion_tema'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'

  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode
}

function applyThemeToDocument(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const [mode, setMode] = useState<ThemeMode>(() => getStoredMode())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredMode()))
  const remoteLoadedRef = useRef(false)
  const warnedRemoteErrorRef = useRef(false)

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)

    const nextTheme = resolveTheme(mode)
    setResolvedTheme(nextTheme)
    applyThemeToDocument(nextTheme)
  }, [mode])

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      remoteLoadedRef.current = false
      return
    }

    let cancelled = false

    const loadRemoteTheme = async () => {
      const { data, error } = await supabase
        .from(THEME_CONFIG_SOURCE)
        .select('modo')
        .eq('usuario_id', user.id)
        .maybeSingle()

      if (cancelled) {
        remoteLoadedRef.current = true
        return
      }

      if (error) {
        if (!warnedRemoteErrorRef.current) {
          warnedRemoteErrorRef.current = true
          toast.warning('No se pudo cargar el tema desde la base. Se usará configuración local.')
        }
        console.error('Error cargando tema remoto:', error)
        remoteLoadedRef.current = true
        return
      }

      const remoteMode = (data as { modo?: string } | null)?.modo
      if (isThemeMode(remoteMode)) {
        setMode(remoteMode)
      }

      remoteLoadedRef.current = true
    }

    void loadRemoteTheme()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    if (!isAuthenticated || !user?.id || !remoteLoadedRef.current) return

    const persistRemoteTheme = async () => {
      const { error } = await supabase.from(THEME_CONFIG_SOURCE).upsert(
        [
          {
            usuario_id: user.id,
            modo: mode,
          },
        ],
        { onConflict: 'usuario_id' },
      )

      if (!error) {
        warnedRemoteErrorRef.current = false
        return
      }

      if (!warnedRemoteErrorRef.current) {
        warnedRemoteErrorRef.current = true
        toast.warning('No se pudo guardar el tema en la base. Revisa permisos o si la vista permite upsert.')
      }
      console.error('Error guardando tema remoto:', error)
    }

    void persistRemoteTheme()
  }, [isAuthenticated, mode, user?.id])

  useEffect(() => {
    if (mode !== 'system') return

    const media = window.matchMedia(DARK_MEDIA_QUERY)

    const handleSystemChange = () => {
      const nextTheme = resolveTheme('system')
      setResolvedTheme(nextTheme)
      applyThemeToDocument(nextTheme)
    }

    media.addEventListener('change', handleSystemChange)
    return () => media.removeEventListener('change', handleSystemChange)
  }, [mode])

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      setMode,
    }),
    [mode, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}
