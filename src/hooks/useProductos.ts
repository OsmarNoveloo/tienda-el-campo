import { useState, useEffect, useCallback } from 'react'
import { getLocalISOString } from '../lib/dateUtils'
import { supabase } from '../lib/supabaseClient'
import type { Producto } from '../types/database'

export function useProductos() {
  "use no memo"
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProductos = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre')
    if (error) setError(error.message)
    else setProductos(data ?? [])
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
    if (error) throw new Error(error.message)
    await fetchProductos()
  }

  return { productos, loading, error, crearProducto, actualizarProducto, eliminarProducto, refetch: fetchProductos }
}
