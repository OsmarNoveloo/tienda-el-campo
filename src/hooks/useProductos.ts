import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/apiClient'
import type { Producto } from '../types/database'

export function useProductos() {
  "use no memo"
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProductos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<Producto[]>('/productos')
      setProductos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProductos()
  }, [fetchProductos])

  const crearProducto = async (values: Omit<Producto, 'id' | 'creado_en' | 'actualizado_en'>) => {
    await api.post('/productos', values)
    await fetchProductos()
  }

  const actualizarProducto = async (id: number, values: Partial<Omit<Producto, 'id' | 'creado_en'>>) => {
    await api.put(`/productos/${id}`, values)
    await fetchProductos()
  }

  const eliminarProducto = async (id: number) => {
    const result = await api.delete<{ mode: 'deleted' | 'deactivated' }>(`/productos/${id}`)
    await fetchProductos()
    return result
  }

  return { productos, loading, error, crearProducto, actualizarProducto, eliminarProducto, refetch: fetchProductos }
}
