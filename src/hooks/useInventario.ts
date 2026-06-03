import { useCallback, useEffect, useState } from 'react'
import { getLocalISOString } from '../lib/dateUtils'
import { includesNormalized, normalizeSearchText } from '../lib/searchUtils'
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
  const PAGE_SIZE_ALL = 1000
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

  const loadStockPage = async ({ page, pageSize, search }: StockPageParams): Promise<StockPageResult> => {
    const safePage = Math.max(1, page)
    const safePageSize = Math.max(1, pageSize)
    const from = (safePage - 1) * safePageSize
    const to = from + safePageSize - 1
    const term = normalizeSearchText(search)

    let productosData: Array<{
      id: number
      nombre: string
      stock_minimo: number
      precio_actual: number
    }> = []
    let total = 0

    if (term) {
      const allProductos: Array<{
        id: number
        nombre: string
        codigo_barras: string | null
        stock_minimo: number
        precio_actual: number
      }> = []
      let chunkFrom = 0

      while (true) {
        const chunkTo = chunkFrom + PAGE_SIZE_ALL - 1
        const { data: chunkRows, error: chunkError } = await supabase
          .from('productos')
          .select('id,nombre,codigo_barras,stock_minimo,precio_actual')
          .eq('activo', true)
          .order('nombre')
          .range(chunkFrom, chunkTo)

        if (chunkError) throw new Error(chunkError.message)

        const rows = (chunkRows ?? []) as Array<{
          id: number
          nombre: string
          codigo_barras: string | null
          stock_minimo: number
          precio_actual: number
        }>

        allProductos.push(...rows)

        if (rows.length < PAGE_SIZE_ALL) break
        chunkFrom += PAGE_SIZE_ALL
      }

      const filtered = allProductos.filter((p) => includesNormalized(p.nombre, term) || includesNormalized(p.codigo_barras, term))

      total = filtered.length
      productosData = filtered.slice(from, to + 1).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        stock_minimo: p.stock_minimo,
        precio_actual: p.precio_actual,
      }))
    } else {
      const { data: productos, error: productsError, count } = await supabase
        .from('productos')
        .select('id,nombre,stock_minimo,precio_actual', { count: 'exact' })
        .eq('activo', true)
        .order('nombre')
        .range(from, to)

      if (productsError) throw new Error(productsError.message)

      productosData = (productos ?? []) as Array<{
        id: number
        nombre: string
        stock_minimo: number
        precio_actual: number
      }>
      total = count ?? 0
    }

    const productoIds = productosData.map((p) => p.id)
    if (!productoIds.length) {
      return { items: [], total }
    }

    const { data: movimientos, error: moveError } = await supabase
      .from('inventario_movimientos')
      .select('id,producto_id,tipo,cantidad,fecha_movimiento')
      .in('producto_id', productoIds)
      .order('fecha_movimiento', { ascending: true })
      .order('id', { ascending: true })

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
        stockMap.set(mov.producto_id, cantidad)
      }
    })

    const items: StockProducto[] = productosData.map((p) => ({
      producto_id: p.id,
      producto_nombre: p.nombre,
      stock_minimo: p.stock_minimo,
      stock_actual: stockMap.get(p.id) ?? 0,
      precio_actual: p.precio_actual,
    }))

    return { items, total }
  }

  const loadStockLowCount = async (): Promise<number> => {
    const { data: productos, error: productsError } = await supabase
      .from('productos')
      .select('id,stock_minimo')
      .eq('activo', true)

    if (productsError) throw new Error(productsError.message)

    const productosData = (productos ?? []) as Array<{ id: number; stock_minimo: number }>
    if (!productosData.length) return 0

    const { data: movimientos, error: moveError } = await supabase
      .from('inventario_movimientos')
      .select('id,producto_id,tipo,cantidad,fecha_movimiento')
      .in('producto_id', productosData.map((p) => p.id))
      .order('fecha_movimiento', { ascending: true })
      .order('id', { ascending: true })

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
        stockMap.set(mov.producto_id, cantidad)
      }
    })

    return productosData.reduce((acc, p) => {
      const stockActual = stockMap.get(p.id) ?? 0
      return stockActual <= Number(p.stock_minimo) ? acc + 1 : acc
    }, 0)
  }

  useEffect(() => {
    loadMovimientos()
  }, [loadMovimientos])

  return { movimientos, loading, error, crearMovimiento, loadMovimientos, loadStockActual, loadStockPage, loadStockLowCount }
}
