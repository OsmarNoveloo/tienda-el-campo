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
  const FETCH_CHUNK = 1000
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
      let ventasHoy = 0
      let ingresoHoy = 0
      let ventasFrom = 0

      while (true) {
        const ventasTo = ventasFrom + FETCH_CHUNK - 1
        const { data: ventasData, error: ventasError } = await supabase
          .from('ventas')
          .select('id, total')
          .eq('estado', 'PAGADA')
          .gte('fecha_venta', todayISO)
          .order('id', { ascending: true })
          .range(ventasFrom, ventasTo)

        if (ventasError) throw ventasError

        const rows = ventasData ?? []
        ventasHoy += rows.length
        ingresoHoy += rows.reduce((acc, v: any) => acc + Number(v.total), 0)

        if (rows.length < FETCH_CHUNK) break
        ventasFrom += FETCH_CHUNK
      }

      // 2. Productos activos
      const { count: productosActivosCount, error: productosCountError } = await supabase
        .from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)

      if (productosCountError) throw productosCountError

      const productosActivos = productosActivosCount ?? 0

      // 3. Stock bajo (usando movimientos para calcular stock)
      const productosBajos: Array<{ id: number; stock_minimo: number }> = []
      let productosFrom = 0

      while (true) {
        const productosTo = productosFrom + FETCH_CHUNK - 1
        const { data: productosChunk, error: bajosError } = await supabase
          .from('productos')
          .select('id, stock_minimo')
          .eq('activo', true)
          .order('id', { ascending: true })
          .range(productosFrom, productosTo)

        if (bajosError) throw bajosError

        const rows = (productosChunk ?? []) as Array<{ id: number; stock_minimo: number }>
        productosBajos.push(...rows)

        if (rows.length < FETCH_CHUNK) break
        productosFrom += FETCH_CHUNK
      }

      let stockBajo = 0

      if (productosBajos.length > 0) {
        // Obtener movimientos para calcular stock actual
        const movimientos: Array<{ producto_id: number; tipo: string; cantidad: number }> = []
        let movimientosFrom = 0

        while (true) {
          const movimientosTo = movimientosFrom + FETCH_CHUNK - 1
          const { data: movimientosChunk, error: movError } = await supabase
            .from('inventario_movimientos')
            .select('producto_id, tipo, cantidad')
            .order('id', { ascending: true })
            .range(movimientosFrom, movimientosTo)

          if (movError) throw movError

          const rows = (movimientosChunk ?? []) as Array<{ producto_id: number; tipo: string; cantidad: number }>
          movimientos.push(...rows)

          if (rows.length < FETCH_CHUNK) break
          movimientosFrom += FETCH_CHUNK
        }

        // Calcular stock por producto
        const stockMap = new Map<number, number>()
        movimientos.forEach((mov) => {
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
        stockBajo = productosBajos.filter((p) => (stockMap.get(p.id) ?? 0) <= p.stock_minimo).length
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

      const ventaIds = (data ?? []).map((v: any) => v.id) as number[]

      // Cargar detalle de productos para todas las ventas a la vez
      let detalleMap = new Map<number, UltimaVentaProducto[]>()
      if (ventaIds.length > 0) {
        const { data: detalleData } = await supabase
          .from('venta_detalle')
          .select('venta_id, cantidad, producto_id')
          .in('venta_id', ventaIds)

        const productoIds = [...new Set((detalleData ?? []).map((d: any) => d.producto_id).filter(Boolean))]
        let productosMap = new Map<number, string>()

        if (productoIds.length > 0) {
          const { data: productosData } = await supabase
            .from('productos')
            .select('id, nombre')
            .in('id', productoIds)
          productosMap = new Map((productosData ?? []).map((p: any) => [p.id, p.nombre]))
        }

        for (const detalle of (detalleData ?? [])) {
          const d = detalle as any
          const lista = detalleMap.get(d.venta_id) ?? []
          lista.push({ nombre: productosMap.get(d.producto_id) ?? 'Adicional', cantidad: Number(d.cantidad) })
          detalleMap.set(d.venta_id, lista)
        }
      }

      const mapped = (data ?? [])
        .map((row: any) => ({
          id: row.id,
          folio: row.folio,
          total: row.total,
          usuario_nombre: usuarioMap.get(row.usuario_id) ?? 'Sin usuario',
          fecha_venta: row.fecha_venta,
          productos: detalleMap.get(row.id) ?? [],
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
