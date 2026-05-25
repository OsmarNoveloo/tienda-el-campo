import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart, Search, Plus, Minus, Trash2, ReceiptText, Wallet, AlertCircle } from 'lucide-react'
import { toast } from 'react-toastify'
import { supabase } from '../../lib/supabaseClient'
import { getLocalISOString } from '../../lib/dateUtils'
import type { Producto } from '../../types/database'

type CartItem = {
  producto: Producto
  cantidad: number
}

type DailySummary = {
  ventasHoy: number
  montoHoy: number
  unidadesVendidasHoy: number
}

type ClienteCreditoOption = {
  id: number
  nombre: string
  limite_credito: number | null
}

const initialSummary: DailySummary = {
  ventasHoy: 0,
  montoHoy: 0,
  unidadesVendidasHoy: 0,
}

function getTodayStartISO() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return getLocalISOString(date);
}

function generateFolio() {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  const YYYY = now.getFullYear()
  const MM = pad(now.getMonth() + 1)
  const DD = pad(now.getDate())
  const hh = pad(now.getHours())
  const mm = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  return `VTA-${YYYY}${MM}${DD}-${hh}${mm}${ss}`
}

export default function PosPage() {
  const SUMMARY_POLL_MS = 20000

  const [productos, setProductos] = useState<Producto[]>([])
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [procesandoVenta, setProcesandoVenta] = useState(false)
  const [haciendoCorte, setHaciendoCorte] = useState(false)
  const [summary, setSummary] = useState<DailySummary>(initialSummary)
  const [clientes, setClientes] = useState<ClienteCreditoOption[]>([])
  const [tipoCobro, setTipoCobro] = useState<'CONTADO' | 'CREDITO'>('CONTADO')
  const [clienteCreditoId, setClienteCreditoId] = useState<number | ''>('')
  const [usuarioId, setUsuarioId] = useState<number | null>(null)
  const [cajaAbierta, setCajaAbierta] = useState<{ id: number; monto_apertura: number } | null>(null)
  const [cajaLoading, setCajaLoading] = useState(true)
  const cajaRequestInFlight = useRef(false)

  const subtotal = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.producto.precio_actual) * item.cantidad, 0),
    [carrito],
  )

  const totalItems = useMemo(
    () => carrito.reduce((acc, item) => acc + item.cantidad, 0),
    [carrito],
  )

  const productosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return productos
    return productos.filter((p) => {
      const nombre = p.nombre.toLowerCase()
      const sku = (p.sku ?? '').toLowerCase()
      const codigo = (p.codigo_barras ?? '').toLowerCase()
      return nombre.includes(term) || sku.includes(term) || codigo.includes(term)
    })
  }, [productos, search])

  const loadProductos = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('nombre')
    if (error) toast.error(error.message)
    setProductos(data ?? [])
    setLoading(false)
  }, [])

  const loadUsuario = useCallback(async () => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id')
      .eq('estado', 'ACTIVO')
      .order('id')
      .limit(1)
      .maybeSingle()

    if (error) {
      toast.error(`No se pudo obtener usuario: ${error.message}`)
      return
    }
    if (!data) {
      toast.error('No hay usuarios activos. Crea un usuario para vender.')
      return
    }
    setUsuarioId(data.id)
  }, [])

  const loadClientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id,nombre,limite_credito,activo')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      toast.error(`No se pudo obtener clientes: ${error.message}`)
      setClientes([])
      return
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      limite_credito: row.limite_credito ?? null,
    })) as ClienteCreditoOption[]

    setClientes(mapped)
  }, [])

  const loadSummary = useCallback(async () => {
    const startISO = getTodayStartISO()

    const { data: ventasData, error: ventasError } = await supabase
      .from('ventas')
      .select('id,total')
      .eq('estado', 'PAGADA')
      .gte('fecha_venta', startISO)

    if (ventasError) {
      toast.error(`Error cargando ventas del dia: ${ventasError.message}`)
      setSummary(initialSummary)
      return
    }

    const ventasHoy = ventasData?.length ?? 0
    const montoHoy = (ventasData ?? []).reduce((acc, row) => acc + Number(row.total), 0)
    const ventaIds = (ventasData ?? []).map((v) => v.id)

    if (ventaIds.length === 0) {
      setSummary({ ventasHoy, montoHoy, unidadesVendidasHoy: 0 })
      return
    }

    const { data: detalleData, error: detalleError } = await supabase
      .from('venta_detalle')
      .select('cantidad')
      .in('venta_id', ventaIds)

    if (detalleError) {
      toast.error(`Error cargando detalle del dia: ${detalleError.message}`)
      setSummary({ ventasHoy, montoHoy, unidadesVendidasHoy: 0 })
      return
    }

    const unidadesVendidasHoy = (detalleData ?? []).reduce((acc, row) => acc + Number(row.cantidad), 0)
    setSummary({ ventasHoy, montoHoy, unidadesVendidasHoy })
  }, [])

  const verificarCajaAbierta = useCallback(async (showLoading = false) => {
    if (cajaRequestInFlight.current) return
    cajaRequestInFlight.current = true
    if (showLoading) setCajaLoading(true)

    const { data, error } = await supabase
      .from('caja_sesiones')
      .select('id,monto_apertura')
      .eq('estado', 'ABIERTA')
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error verificando caja:', error.message)
      if (showLoading) setCajaLoading(false)
      cajaRequestInFlight.current = false
      return
    }

    setCajaAbierta((prev) => {
      const next = data ?? null
      if (!prev && !next) return prev
      if (prev && next && prev.id === next.id && prev.monto_apertura === next.monto_apertura) return prev
      return next
    })

    if (showLoading) setCajaLoading(false)
    cajaRequestInFlight.current = false
  }, [])

  // Efecto separado para reaccionar a cambios de caja
  useEffect(() => {
    if (cajaAbierta === null && cajaLoading === false) {
      setCarrito([])
      setSummary(initialSummary)
    }
  }, [cajaAbierta, cajaLoading])

  // Inicializar al montar el componente
  useEffect(() => {
    loadUsuario()
    loadClientes()
    loadProductos()
    verificarCajaAbierta(true)
    loadSummary()
  }, []) // Dependencias vacías: solo se ejecuta al montar

  // Escuchar cambios de caja en tiempo real para evitar polling constante
  useEffect(() => {
    const channel = supabase
      .channel('pos-caja-sesiones')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caja_sesiones' },
        () => {
          if (document.hidden) return
          void verificarCajaAbierta(false)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !document.hidden) {
          void verificarCajaAbierta(false)
        }
      })

    const handleVisibilityChange = () => {
      if (document.hidden) return
      void verificarCajaAbierta(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [verificarCajaAbierta])

  // Refrescar resumen periódicamente solo en pestaña visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return
      loadSummary()
    }, SUMMARY_POLL_MS)

    return () => clearInterval(interval)
  }, [loadSummary])

  const addToCart = (producto: Producto) => {
    setCarrito((prev) => {
      const existing = prev.find((item) => item.producto.id === producto.id)
      if (existing) {
        return prev.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item,
        )
      }
      return [...prev, { producto, cantidad: 1 }]
    })
  }

  const changeQty = (productoId: number, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((item) =>
          item.producto.id === productoId
            ? { ...item, cantidad: Math.max(1, item.cantidad + delta) }
            : item,
        )
        .filter((item) => item.cantidad > 0),
    )
  }

  const removeFromCart = (productoId: number) => {
    setCarrito((prev) => prev.filter((item) => item.producto.id !== productoId))
  }

  const finalizarVenta = async () => {
    if (!usuarioId) {
      toast.error('No hay usuario activo para registrar la venta.')
      return
    }
    if (!cajaAbierta) {
      toast.error('No hay caja abierta. Abre una caja desde el módulo Caja.')
      return
    }
    if (carrito.length === 0) {
      toast.info('Agrega productos al carrito.')
      return
    }
    if (tipoCobro === 'CREDITO' && !clienteCreditoId) {
      toast.error('Selecciona un cliente para registrar deuda.')
      return
    }

    setProcesandoVenta(true)
    const folio = generateFolio()
    const total = Number(subtotal.toFixed(2))
    const estadoVenta = tipoCobro === 'CREDITO' ? 'CANCELADA' : 'PAGADA'

    const { data: ventaRow, error: ventaError } = await supabase
      .from('ventas')
      .insert([
        {
          caja_sesion_id: cajaAbierta.id,
          usuario_id: usuarioId,
          folio,
          subtotal: total,
          descuento: 0,
          impuesto: 0,
          total,
          estado: estadoVenta,
          observacion: tipoCobro === 'CREDITO' ? 'Venta registrada a crédito desde POS' : null,
          fecha_venta: getLocalISOString(),
        },
      ])
      .select('id')
      .single()

    if (ventaError || !ventaRow) {
      toast.error(ventaError?.message ?? 'No se pudo crear la venta.')
      setProcesandoVenta(false)
      return
    }

    const detallePayload = carrito.map((item) => {
      const precio = Number(item.producto.precio_actual)
      const cantidad = Number(item.cantidad)
      const lineSubtotal = Number((precio * cantidad).toFixed(2))
      return {
        venta_id: ventaRow.id,
        producto_id: item.producto.id,
        cantidad,
        precio_unitario: precio,
        descuento: 0,
        subtotal: lineSubtotal,
        costo_unitario: Number(item.producto.costo_actual),
      }
    })

    const { error: detalleError } = await supabase.from('venta_detalle').insert(detallePayload)
    if (detalleError) {
      toast.error(`Venta creada, pero fallo detalle: ${detalleError.message}`)
      setProcesandoVenta(false)
      return
    }

    const movimientosPayload = carrito.map((item) => ({
      producto_id: item.producto.id,
      usuario_id: usuarioId,
      tipo: 'SALIDA' as const,
      cantidad: Number(item.cantidad),
      costo_unitario: Number(item.producto.costo_actual),
      referencia_tipo: 'VENTA',
      referencia_id: ventaRow.id,
      observacion: `Salida por venta ${folio}`,
      fecha_movimiento: getLocalISOString(),
    }))
    const { error: movimientoError } = await supabase.from('inventario_movimientos').insert(movimientosPayload)
    if (movimientoError) {
      toast.warning(`Venta guardada, pero no se registro movimiento: ${movimientoError.message}`)
    }

    if (tipoCobro === 'CREDITO') {
      const { error: creditoError } = await supabase.from('creditos_ventas').insert([
        {
          venta_id: ventaRow.id,
          cliente_id: Number(clienteCreditoId),
          usuario_id: usuarioId,
          fecha_credito: getLocalISOString(),
          total_credito: total,
          saldo_pendiente: total,
          estado: 'PENDIENTE',
          observaciones: `Crédito generado desde POS (${folio})`,
        },
      ])

      if (creditoError) {
        toast.warning(`Venta guardada, pero no se registro crédito: ${creditoError.message}`)
      }
    }

    setCarrito([])
    setTipoCobro('CONTADO')
    setClienteCreditoId('')
    await loadSummary()
    toast.success(
      tipoCobro === 'CREDITO'
        ? `Crédito registrado para cliente (${folio})`
        : `Venta registrada: ${folio}`,
    )
    setProcesandoVenta(false)
  }

  const hacerCorte = async () => {
    if (!usuarioId) {
      toast.error('No hay usuario activo para hacer corte.')
      return
    }

    if (!cajaAbierta) {
      toast.error('No hay caja abierta para hacer corte.')
      return
    }

    setHaciendoCorte(true)
    const efectivoEsperado = Number(cajaAbierta.monto_apertura) + Number(summary.montoHoy)

    const { error: corteError } = await supabase.from('cortes_caja').insert([
      {
        caja_sesion_id: cajaAbierta.id,
        usuario_id: usuarioId,
        total_ventas: Number(summary.montoHoy.toFixed(2)),
        total_efectivo: Number(summary.montoHoy.toFixed(2)),
        total_tarjeta: 0,
        total_entradas: 0,
        total_salidas: 0,
        efectivo_esperado: Number(efectivoEsperado.toFixed(2)),
        efectivo_contado: Number(efectivoEsperado.toFixed(2)),
        diferencia: 0,
        observacion: 'Corte generado desde POS',
      },
    ])

    if (corteError) {
      toast.error(corteError.message)
      setHaciendoCorte(false)
      return
    }

    const { error: cierreError } = await supabase
      .from('caja_sesiones')
      .update({
        estado: 'CERRADA',
        fecha_cierre: getLocalISOString(),
        empleado_cierre_id: usuarioId,
      })
      .eq('id', cajaAbierta.id)

    if (cierreError) {
      toast.warning(`Corte creado, pero no se cerro caja: ${cierreError.message}`)
      setHaciendoCorte(false)
      return
    }

    toast.success('Corte de caja realizado.')
    // Reiniciar todo después de cerrar
    await verificarCajaAbierta(true)
    setHaciendoCorte(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Punto de Venta</h1>
        </div>
        <button
          onClick={hacerCorte}
          disabled={haciendoCorte || !cajaAbierta}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
          title={!cajaAbierta ? 'Abre una caja para hacer corte' : ''}
        >
          <Wallet size={16} />
          {haciendoCorte ? 'Generando corte...' : 'Hacer corte'}
        </button>
      </div>

      {!cajaAbierta && cajaLoading === false && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-red-900 text-sm">No hay caja abierta</p>
            <p className="text-red-800 text-xs mt-1">Abre una caja desde el módulo <strong>Caja</strong> para poder vender.</p>
          </div>
        </div>
      )}

      {cajaAbierta && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase">Caja abierta • Monto: ${Number(cajaAbierta.monto_apertura).toFixed(2)}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Ventas del dia</p>
          <p className="text-2xl font-bold text-gray-800">{summary.ventasHoy}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Monto vendido del dia</p>
          <p className="text-2xl font-bold text-emerald-700">${summary.montoHoy.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Cantidad vendida del dia</p>
          <p className="text-2xl font-bold text-indigo-700">{summary.unidadesVendidasHoy.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU o codigo de barras"
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Cargando productos...</div>
          ) : (
            <div className="max-h-140 overflow-auto divide-y divide-gray-50">
              {productosFiltrados.map((producto) => (
                <div key={producto.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800">{producto.nombre}</p>
                    <p className="text-xs text-gray-500">SKU: {producto.sku ?? 'N/A'} | Codigo: {producto.codigo_barras ?? 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-800">${Number(producto.precio_actual).toFixed(2)}</p>
                    <button
                      onClick={() => addToCart(producto)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                    >
                      <Plus size={14} />
                      Agregar
                    </button>
                  </div>
                </div>
              ))}
              {!productosFiltrados.length && (
                <div className="p-8 text-center text-sm text-gray-400">No hay productos para mostrar.</div>
              )}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <ReceiptText size={18} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-800">Venta actual</h2>
          </div>

          <div className="max-h-105 overflow-auto divide-y divide-gray-50">
            {carrito.map((item) => (
              <div key={item.producto.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{item.producto.nombre}</p>
                  <button
                    onClick={() => removeFromCart(item.producto.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center rounded-lg border border-gray-200">
                    <button
                      onClick={() => changeQty(item.producto.id, -1)}
                      className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="px-3 text-sm">{item.cantidad}</span>
                    <button
                      onClick={() => changeQty(item.producto.id, 1)}
                      className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">
                    ${(Number(item.producto.precio_actual) * item.cantidad).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}

            {!carrito.length && (
              <div className="p-8 text-center text-sm text-gray-400">Agrega productos para iniciar la venta.</div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 space-y-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase">Tipo de cobro</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoCobro('CONTADO')}
                  className={`py-2 rounded-lg text-xs font-semibold border ${tipoCobro === 'CONTADO' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Contado
                </button>
                <button
                  type="button"
                  onClick={() => setTipoCobro('CREDITO')}
                  className={`py-2 rounded-lg text-xs font-semibold border ${tipoCobro === 'CREDITO' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Crédito
                </button>
              </div>
              {tipoCobro === 'CREDITO' && (
                <select
                  value={clienteCreditoId}
                  onChange={(e) => setClienteCreditoId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                      {cliente.limite_credito !== null ? ` • Límite: $${Number(cliente.limite_credito).toFixed(2)}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Articulos</span>
              <span>{totalItems}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-gray-900">
              <span>Total</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <button
              onClick={finalizarVenta}
              disabled={!carrito.length || procesandoVenta || !cajaAbierta}
              className="w-full mt-2 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
              title={!cajaAbierta ? 'Abre una caja para vender' : ''}
            >
              {procesandoVenta ? 'Guardando venta...' : 'Finalizar venta'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
