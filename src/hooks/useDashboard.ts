import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import { useSystemConfig } from './useSystemConfig'

export type DashboardStats = {
  ventasHoy: number
  ingresoHoy: number
  productosActivos: number
  stockBajo: number
}

export type UltimaVentaProducto = {
  nombre: string
  cantidad: number
}

export type UltimaVenta = {
  id: number
  folio: string
  total: number
  usuario_nombre: string
  fecha_venta: string
  productos: UltimaVentaProducto[]
}

export function useDashboard() {
  const { config } = useSystemConfig()
  const [stats, setStats] = useState<DashboardStats>({
    ventasHoy: 0,
    ingresoHoy: 0,
    productosActivos: 0,
    stockBajo: 0,
  })
  const [ultimasVentas, setUltimasVentas] = useState<UltimaVenta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<DashboardStats>('/dashboard/stats')
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando estadísticas')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUltimasVentas = useCallback(async () => {
    try {
      const data = await api.get<UltimaVenta[]>('/dashboard/ultimas-ventas?limit=5')
      setUltimasVentas(data)
    } catch {
      // no bloquea la UI si falla
    }
  }, [])

  useEffect(() => {
    loadStats()
    loadUltimasVentas()

    const refreshMs = config.dashboardRefreshSeconds * 1000
    const interval = setInterval(() => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      loadStats()
      loadUltimasVentas()
    }, refreshMs)

    return () => clearInterval(interval)
  }, [config.dashboardRefreshSeconds, config.pauseRefreshOnHiddenTab, loadStats, loadUltimasVentas])

  return {
    stats,
    ultimasVentas,
    loading,
    error,
    refetch: async () => { await Promise.all([loadStats(), loadUltimasVentas()]) },
  }
}
