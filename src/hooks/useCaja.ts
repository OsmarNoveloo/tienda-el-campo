import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import { useSystemConfig } from './useSystemConfig'
import type { CajaSesion, CorteCaja } from '../types/database'

export type CajaSesionRow = CajaSesion & { usuario_nombre: string }
export type CorteCajaRow = CorteCaja & { usuario_nombre: string }

export function useCaja() {
  const { config } = useSystemConfig()
  const [cajaActual, setCajaActual] = useState<CajaSesionRow | null>(null)
  const [cortes, setCortes] = useState<CorteCajaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCajaActual = useCallback(async () => {
    setError(null)
    try {
      const data = await api.get<CajaSesionRow | null>('/caja/actual')
      setCajaActual(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar caja')
      setCajaActual(null)
    }
  }, [])

  const loadCortes = useCallback(async () => {
    try {
      const data = await api.get<CorteCajaRow[]>(`/caja/cortes?limit=${config.cajaHistorialLimit}`)
      setCortes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cortes')
    }
  }, [config.cajaHistorialLimit])

  const abrirCaja = async (payload: { empleado_apertura_id: number; monto_apertura: number }) => {
    setLoading(true)
    try {
      await api.post('/caja/abrir', payload)
      await loadCajaActual()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir caja')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const cerrarCaja = async (
    cajaId: number,
    payload: { empleado_cierre_id: number; total_efectivo: number; total_tarjeta: number; observaciones?: string },
  ) => {
    setLoading(true)
    try {
      await api.post(`/caja/cerrar/${cajaId}`, payload)
      await Promise.all([loadCajaActual(), loadCortes()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar caja')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const recalcularCorte = async (corteId: number, cajaSesionId: number) => {
    setLoading(true)
    setError(null)
    try {
      await api.post(`/caja/cortes/${corteId}/recalcular`, { caja_sesion_id: cajaSesionId })
      await loadCortes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al recalcular')
      throw err
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCajaActual()
    loadCortes()
  }, [loadCajaActual, loadCortes])

  return {
    cajaActual,
    cortes,
    loading,
    error,
    abrirCaja,
    cerrarCaja,
    recalcularCorte,
    refetch: async () => { await Promise.all([loadCajaActual(), loadCortes()]) },
  }
}
