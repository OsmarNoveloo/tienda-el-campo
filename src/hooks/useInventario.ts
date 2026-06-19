import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
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

export type StockPageParams = {
  page: number
  pageSize: number
  search?: string
}

export type StockPageResult = {
  items: StockProducto[]
  total: number
}

export function useInventario() {
  const { config } = useSystemConfig()
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMovimientos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<MovimientoRow[]>(
        `/inventario/movimientos?limit=${config.inventarioMovimientosLimit}`,
      )
      setMovimientos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }, [config.inventarioMovimientosLimit])

  const crearMovimiento = useCallback(async (payload: {
    producto_id: number
    usuario_id: number
    tipo: TipoMovimiento
    cantidad: number
    costo_unitario?: number | null
    referencia_tipo?: string | null
    referencia_id?: number | null
    observacion?: string | null
  }) => {
    await api.post('/inventario/movimientos', payload)
    await loadMovimientos()
  }, [loadMovimientos])

  const loadStockActual = useCallback((): Promise<StockProducto[]> => {
    return api.get<StockProducto[]>('/inventario/stock')
  }, [])

  const loadStockPage = useCallback(({ page, pageSize, search }: StockPageParams): Promise<StockPageResult> => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(search ? { search } : {}),
    })
    return api.get<StockPageResult>(`/inventario/stock/page?${params}`)
  }, [])

  const loadStockLowCount = useCallback((): Promise<number> => {
    return api.get<{ count: number }>('/inventario/stock/bajo').then(({ count }) => count)
  }, [])

  useEffect(() => {
    loadMovimientos()
  }, [loadMovimientos])

  return { movimientos, loading, error, crearMovimiento, loadMovimientos, loadStockActual, loadStockPage, loadStockLowCount }
}
