import { useCallback, useEffect, useState } from 'react'
import { getLocalISOString } from '../lib/dateUtils'
import { supabase } from '../lib/supabaseClient'
import { useSystemConfig } from './useSystemConfig'
import type { CajaSesion, CorteCaja } from '../types/database'

export type CajaSesionRow = CajaSesion & {
  usuario_nombre: string
}

export type CorteCajaRow = CorteCaja & {
  usuario_nombre: string
}

export function useCaja() {
  const { config } = useSystemConfig()
  const [cajaActual, setCajaActual] = useState<CajaSesionRow | null>(null)
  const [cortes, setCortes] = useState<CorteCajaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCajaActual = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase
      .from('caja_sesiones')
      .select('*')
      .eq('estado', 'ABIERTA')
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (err) {
      setError(err.message)
      setCajaActual(null)
      return
    }

    if (data) {
      // Cargar empleado por separado
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nombre')
        .eq('id', data.empleado_apertura_id)
        .single()

      setCajaActual({
        ...data,
        usuario_nombre: usuario?.nombre ?? 'Sin usuario',
      })
    } else {
      setCajaActual(null)
    }
  }, [])

  const loadCortes = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('cortes_caja')
      .select('*')
      .order('id', { ascending: false })
      .limit(config.cajaHistorialLimit)

    if (err) {
      setError(err.message)
      return
    }

    if (!data || data.length === 0) {
      setCortes([])
      return
    }

    // Obtener todos los IDs de usuario únicos
    const usuarioIds = [...new Set((data ?? []).map((c: any) => c.usuario_id))]
    
    // Cargar información de usuarios
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', usuarioIds)

    const usuarioMap = new Map((usuarios ?? []).map((u: any) => [u.id, u.nombre]))

    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      usuario_nombre: usuarioMap.get(row.usuario_id) ?? 'Sin usuario',
    }))

    setCortes(mapped)
  }, [config.cajaHistorialLimit])

  const abrirCaja = async (payload: {
    empleado_apertura_id: number
    monto_apertura: number
  }) => {
    setLoading(true)
    const { error: err } = await supabase.from('caja_sesiones').insert([
      {
        empleado_apertura_id: payload.empleado_apertura_id,
        monto_apertura: payload.monto_apertura,
        estado: 'ABIERTA',
        fecha_apertura: getLocalISOString(),
      },
    ])

    if (err) {
      setError(err.message)
      setLoading(false)
      throw new Error(err.message)
    }

    await loadCajaActual()
    setLoading(false)
  }

  const cerrarCaja = async (cajaId: number, payload: {
    empleado_cierre_id: number
    total_efectivo: number
    total_tarjeta: number
    observaciones?: string
  }) => {
    setLoading(true)

    // Obtener monto apertura y calcular totales
    const { data: caja, error: cajaErr } = await supabase
      .from('caja_sesiones')
      .select('monto_apertura')
      .eq('id', cajaId)
      .single()

    if (cajaErr) {
      setError(cajaErr.message)
      setLoading(false)
      throw new Error(cajaErr.message)
    }

    const montoApertura = caja?.monto_apertura ?? 0
    const totalEfectivo = payload.total_efectivo
    const totalTarjeta = payload.total_tarjeta
    const totalVentas = Number(totalEfectivo) + Number(totalTarjeta)
    const efectivoEsperado = Number(montoApertura) + Number(totalEfectivo)

    const { error: corteErr } = await supabase.from('cortes_caja').insert([
      {
        caja_sesion_id: cajaId,
        usuario_id: payload.empleado_cierre_id,
        fecha_corte: getLocalISOString(),
        total_ventas: Number(totalVentas.toFixed(2)),
        total_efectivo: Number(totalEfectivo.toFixed(2)),
        total_tarjeta: Number(totalTarjeta.toFixed(2)),
        total_entradas: 0,
        total_salidas: 0,
        efectivo_esperado: Number(efectivoEsperado.toFixed(2)),
        efectivo_contado: Number(efectivoEsperado.toFixed(2)),
        diferencia: 0,
        observacion: payload.observaciones ?? null,
      },
    ])

    if (corteErr) {
      setError(corteErr.message)
      setLoading(false)
      throw new Error(corteErr.message)
    }

    // Actualizar caja_sesion con cierre
    const { error: updateErr } = await supabase
      .from('caja_sesiones')
      .update({
        empleado_cierre_id: payload.empleado_cierre_id,
        estado: 'CERRADA',
        fecha_cierre: getLocalISOString(),
      })
      .eq('id', cajaId)

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      throw new Error(updateErr.message)
    }

    await Promise.all([loadCajaActual(), loadCortes()])
    setLoading(false)
  }

  useEffect(() => {
    loadCajaActual()
    loadCortes()
  }, [loadCajaActual, loadCortes])

  const recalcularCorte = async (corteId: number, cajaSesionId: number) => {
    setLoading(true)
    setError(null)

    // Sumar todas las ventas PAGADA de esa sesión de caja
    const { data: ventasData, error: ventasErr } = await supabase
      .from('ventas')
      .select('id,total')
      .eq('estado', 'PAGADA')
      .eq('caja_sesion_id', cajaSesionId)

    if (ventasErr) {
      setError(ventasErr.message)
      setLoading(false)
      throw new Error(ventasErr.message)
    }

    const ventaIds = (ventasData ?? []).map((v: any) => v.id)
    const totalVentas = (ventasData ?? []).reduce((acc: number, v: any) => acc + Number(v.total), 0)

    // Sumar unidades vendidas
    let unidades = 0
    if (ventaIds.length > 0) {
      const { data: detalleData } = await supabase
        .from('venta_detalle')
        .select('cantidad')
        .in('venta_id', ventaIds)
      unidades = (detalleData ?? []).reduce((acc: number, d: any) => acc + Number(d.cantidad), 0)
    }

    // Obtener monto_apertura para recalcular efectivo_esperado
    const { data: sesionData } = await supabase
      .from('caja_sesiones')
      .select('monto_apertura')
      .eq('id', cajaSesionId)
      .single()

    const montoApertura = Number(sesionData?.monto_apertura ?? 0)
    const efectivoEsperado = montoApertura + totalVentas

    const { error: updateErr } = await supabase
      .from('cortes_caja')
      .update({
        total_ventas: Number(totalVentas.toFixed(2)),
        total_efectivo: Number(totalVentas.toFixed(2)),
        efectivo_esperado: Number(efectivoEsperado.toFixed(2)),
        efectivo_contado: Number(efectivoEsperado.toFixed(2)),
        observacion: `Recalculado — ${ventasData?.length ?? 0} ventas, ${unidades} unidades`,
      })
      .eq('id', corteId)

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      throw new Error(updateErr.message)
    }

    await loadCortes()
    setLoading(false)
  }

  return {
    cajaActual,
    cortes,
    loading,
    error,
    abrirCaja,
    cerrarCaja,
    recalcularCorte,
    refetch: async () => {
      await Promise.all([loadCajaActual(), loadCortes()])
    },
  }
}
