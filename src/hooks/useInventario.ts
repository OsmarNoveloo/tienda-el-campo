import { useCallback, useEffect, useState } from 'react'
import { getLocalISOString } from '../lib/dateUtils'
import { supabase } from '../lib/supabaseClient'
import { useSystemConfig } from './useSystemConfig'
import type { TipoMovimiento } from '../types/database'

export type MovimientoRow = {
  id: number
  producto_id: number
  producto_nombre: string
  usuario_id: number
  usuario_nombre: string
  tipo: TipoMovimiento
  cantidad: number
  costo_unitario: number | null
  referencia_tipo: string | null
  referencia_id: number | null
  observacion: string | null
  fecha_movimiento: string
}

export type StockProducto = {
  producto_id: number
  producto_nombre: string
  stock_minimo: number
  stock_actual: number
  precio_actual: number
}

export function useInventario() {
  const { config } = useSystemConfig()
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMovimientos = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('inventario_movimientos')
      .select(`
        id,
        producto_id,
        usuario_id,
        tipo,
        cantidad,
        costo_unitario,
        referencia_tipo,
        referencia_id,
        observacion,
        fecha_movimiento,
        productos(nombre),
        usuarios(nombre)
      `)
      .order('fecha_movimiento', { ascending: false })
      .limit(config.inventarioMovimientosLimit)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      producto_id: row.producto_id,
      producto_nombre: row.productos?.nombre ?? 'Sin nombre',
      usuario_id: row.usuario_id,
      usuario_nombre: row.usuarios?.nombre ?? 'Sin usuario',
      tipo: row.tipo,
      cantidad: row.cantidad,
      costo_unitario: row.costo_unitario,
      referencia_tipo: row.referencia_tipo,
      referencia_id: row.referencia_id,
      observacion: row.observacion,
      fecha_movimiento: row.fecha_movimiento,
    }))

    setMovimientos(mapped)
    setLoading(false)
  }, [config.inventarioMovimientosLimit])

  const crearMovimiento = async (payload: {
    producto_id: number
    usuario_id: number
    tipo: TipoMovimiento
    cantidad: number
    costo_unitario?: number | null
    referencia_tipo?: string | null
    referencia_id?: number | null
    observacion?: string | null
  }) => {
    const { error } = await supabase.from('inventario_movimientos').insert([
      { ...payload, fecha_movimiento: getLocalISOString() }
    ])
    if (error) throw new Error(error.message)
    await loadMovimientos()
  }

  const loadStockActual = async (): Promise<StockProducto[]> => {
    const { data: productos, error: productsError } = await supabase
      .from('productos')
      .select('id,nombre,stock_minimo,precio_actual')
      .eq('activo', true)

    if (productsError) throw new Error(productsError.message)

    const { data: movimientos, error: moveError } = await supabase
      .from('inventario_movimientos')
      .select('producto_id,tipo,cantidad')

    if (moveError) throw new Error(moveError.message)

    const stockMap = new Map<number, number>()

    ;(movimientos ?? []).forEach((mov: any) => {
      const current = stockMap.get(mov.producto_id) ?? 0
      const cantidad = Number(mov.cantidad)

      if (mov.tipo === 'ENTRADA') {
        stockMap.set(mov.producto_id, current + cantidad)
      } else if (mov.tipo === 'SALIDA') {
        stockMap.set(mov.producto_id, current - cantidad)
      } else if (mov.tipo === 'AJUSTE') {
        // AJUSTE reemplaza el stock
        stockMap.set(mov.producto_id, cantidad)
      }
    })

    return (productos ?? []).map((p: any) => ({
      producto_id: p.id,
      producto_nombre: p.nombre,
      stock_minimo: p.stock_minimo,
      stock_actual: stockMap.get(p.id) ?? 0,
      precio_actual: p.precio_actual,
    }))
  }

  useEffect(() => {
    loadMovimientos()
  }, [loadMovimientos])

  return { movimientos, loading, error, crearMovimiento, loadMovimientos, loadStockActual }
}
