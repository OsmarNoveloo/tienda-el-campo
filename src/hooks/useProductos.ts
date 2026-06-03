import { useState, useEffect, useCallback } from 'react'
import { getLocalISOString } from '../lib/dateUtils'
import { supabase } from '../lib/supabaseClient'
import type { Producto } from '../types/database'

export function useProductos() {
  "use no memo"
  const PAGE_SIZE = 1000
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProductos = useCallback(async () => {
    setLoading(true)
    setError(null)
    const allProductos: Producto[] = []
    let from = 0
    let hasError = false

    while (true) {
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('nombre')
        .range(from, to)

      if (error) {
        setError(error.message)
        hasError = true
        break
      }

      const rows = (data ?? []) as Producto[]
      allProductos.push(...rows)

      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    if (!hasError) {
      setProductos(allProductos)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProductos()
  }, [fetchProductos])

  const crearProducto = async (values: Omit<Producto, 'id' | 'creado_en' | 'actualizado_en'>) => {
    const { error } = await supabase.from('productos').insert([
      { ...values, creado_en: getLocalISOString() }
    ])
    if (error) throw new Error(error.message)
    await fetchProductos()
  }

  const actualizarProducto = async (id: number, values: Partial<Omit<Producto, 'id' | 'creado_en'>>) => {
    const { error } = await supabase.from('productos').update(values).eq('id', id).select()
    if (error) throw new Error(error.message)
    await fetchProductos()
  }

  const eliminarProducto = async (id: number) => {
    const { error } = await supabase.from('productos').delete().eq('id', id)

    if (!error) {
      await fetchProductos()
      return { mode: 'deleted' as const }
    }

    const isFkError =
      (error as any).code === '23503' ||
      error.message.includes('inventario_movimientos_producto_id_fkey') ||
      error.message.includes('venta_detalle_producto_id_fkey')

    if (!isFkError) {
      throw new Error(error.message)
    }

    const { error: deactivateError } = await supabase
      .from('productos')
      .update({ activo: false, actualizado_en: getLocalISOString() })
      .eq('id', id)

    if (deactivateError) {
      throw new Error(deactivateError.message)
    }

    await fetchProductos()
    return { mode: 'deactivated' as const }
  }

  return { productos, loading, error, crearProducto, actualizarProducto, eliminarProducto, refetch: fetchProductos }
}
