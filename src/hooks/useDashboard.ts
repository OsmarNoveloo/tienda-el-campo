import { useCallback, useEffect, useState } from 'react'
import { getLocalISOString } from '../lib/dateUtils'
import { supabase } from '../lib/supabaseClient'
import { useSystemConfig } from './useSystemConfig'

export type DashboardStats = {
  ventasHoy: number
  ingresoHoy: number
  productosActivos: number
  stockBajo: number
}

export type UltimaVenta = {
  id: number
  folio: string
  total: number
  usuario_nombre: string
  fecha_venta: string
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
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = getLocalISOString(today)

      // 1. Ventas y ingresos del día
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas')
        .select('id, total')
        .eq('estado', 'PAGADA')
        .gte('fecha_venta', todayISO)

      if (ventasError) throw ventasError

      const ventasHoy = (ventasData ?? []).length
      const ingresoHoy = (ventasData ?? []).reduce((acc, v) => acc + Number(v.total), 0)

      // 2. Productos activos
      const { data: productosData, error: productosError } = await supabase
        .from('productos')
        .select('id')
        .eq('activo', true)

      if (productosError) throw productosError

      const productosActivos = (productosData ?? []).length

      // 3. Stock bajo (usando movimientos para calcular stock)
      const { data: productosBajos, error: bajosError } = await supabase
        .from('productos')
        .select('id, nombre, stock_minimo')
        .eq('activo', true)

      if (bajosError) throw bajosError

      let stockBajo = 0

      if ((productosBajos ?? []).length > 0) {
        // Obtener movimientos para calcular stock actual
        const { data: movimientos, error: movError } = await supabase
          .from('inventario_movimientos')
          .select('producto_id, tipo, cantidad')

        if (movError) throw movError

        // Calcular stock por producto
        const stockMap = new Map<number, number>()
        ;(movimientos ?? []).forEach((mov: any) => {
          const current = stockMap.get(mov.producto_id) ?? 0
          const cantidad = Number(mov.cantidad)

          if (mov.tipo === 'ENTRADA') {
            stockMap.set(mov.producto_id, current + cantidad)
          } else if (mov.tipo === 'SALIDA') {
            stockMap.set(mov.producto_id, current - cantidad)
          } else if (mov.tipo === 'AJUSTE') {
            stockMap.set(mov.producto_id, cantidad)
          }
        })

        // Contar stock bajo
        stockBajo = (productosBajos ?? []).filter(
          (p: any) => (stockMap.get(p.id) ?? 0) <= p.stock_minimo
        ).length
      }

      setStats({
        ventasHoy,
        ingresoHoy,
        productosActivos,
        stockBajo,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando estadísticas')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUltimasVentas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, total, usuario_id, fecha_venta')
        .order('fecha_venta', { ascending: false })
        .order('id', { ascending: false })
        .limit(5)

      if (error) throw error

      const usuarioIds = [...new Set((data ?? []).map((v: any) => v.usuario_id).filter(Boolean))] as number[]
      let usuarioMap = new Map<number, string>()

      if (usuarioIds.length > 0) {
        const { data: usuariosData } = await supabase
          .from('usuarios')
          .select('id, nombre')
          .in('id', usuarioIds)

        usuarioMap = new Map((usuariosData ?? []).map((u: any) => [u.id, u.nombre]))
      }

      const mapped = (data ?? [])
        .map((row: any) => ({
          id: row.id,
          folio: row.folio,
          total: row.total,
          usuario_nombre: usuarioMap.get(row.usuario_id) ?? 'Sin usuario',
          fecha_venta: row.fecha_venta,
        }))
        .sort((a, b) => {
          const fechaA = new Date(a.fecha_venta).getTime()
          const fechaB = new Date(b.fecha_venta).getTime()
          if (fechaA !== fechaB) return fechaB - fechaA
          return b.id - a.id
        })

      setUltimasVentas(mapped)
    } catch (e) {
      console.error('Error cargando últimas ventas:', e)
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
    refetch: async () => {
      await Promise.all([loadStats(), loadUltimasVentas()])
    },
  }
}
