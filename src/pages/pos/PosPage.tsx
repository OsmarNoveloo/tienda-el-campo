import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart, Search, Plus, Minus, Trash2, ReceiptText, Wallet, AlertCircle, WifiOff, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { getLocalISOString } from '../../lib/dateUtils'
import { useSystemConfig } from '../../hooks/useSystemConfig'
import { normalizeSearchText } from '../../lib/searchUtils'
import type { Producto } from '../../types/database'
import {
  saveProductosToCache, getProductosFromCache,
  saveClientesToCache, getClientesFromCache,
  saveCajaToCache, getCajaFromCache,
  queueVenta, isNetworkError,
} from '../../lib/posOfflineDB'
import { usePosOfflineSync } from '../../hooks/usePosOfflineSync'

type CartItem = {
  producto: Producto
  cantidad: number
  isQuickItem?: boolean
  quickCode?: string
}

type DailySummary = {
  ventasHoy: number
  montoHoy: number
  montoTotalDia: number
  unidadesVendidasHoy: number
}

type ClienteCreditoOption = {
  id: number
  nombre: string
  saldo_deuda: number
}

const initialSummary: DailySummary = {
  ventasHoy: 0,
  montoHoy: 0,
  montoTotalDia: 0,
  unidadesVendidasHoy: 0,
}

const PRODUCTOS_FETCH_CHUNK = 1000
const PRODUCTOS_PAGE_SIZE = 20
const SALE_TIMEOUT_MS = 4000 // si Supabase no responde en 4s, encolar offline

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

function generateBaseQuickCode() {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  const YYYY = now.getFullYear()
  const MM = pad(now.getMonth() + 1)
  const DD = pad(now.getDate())
  const hh = pad(now.getHours())
  const mm = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `POS-${YYYY}${MM}${DD}${hh}${mm}${ss}-${rand}`
}

export default function PosPage() {
  const { user } = useAuth()
  const { config } = useSystemConfig()
  const SUMMARY_POLL_MS = config.posSummaryRefreshSeconds * 1000

  const [productos, setProductos] = useState<Producto[]>([])
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshingProductos, setRefreshingProductos] = useState(false)
  const [haciendoCorte, setHaciendoCorte] = useState(false)
  const [productoRapidoPrecio, setProductoRapidoPrecio] = useState('')
  const [summary, setSummary] = useState<DailySummary>(initialSummary)
  const [clientes, setClientes] = useState<ClienteCreditoOption[]>([])
  const [tipoCobro, setTipoCobro] = useState<'CONTADO' | 'CREDITO'>('CONTADO')
  const [clienteCreditoId, setClienteCreditoId] = useState<number | ''>('')
  const [cajaAbierta, setCajaAbierta] = useState<{ id: number; monto_apertura: number; fecha_apertura: string } | null>(null)
  const [cajaLoading, setCajaLoading] = useState(true)
  const cajaRequestInFlight = useRef(false)
  const searchTypingMeta = useRef({
    lastTs: 0,
    isRapidSequence: true,
    prevValue: '',
  })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const barcodeBufferRef = useRef('')
  const barcodeLastKeyRef = useRef(0)
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const globalKeyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})

  const subtotal = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.producto.precio_actual) * item.cantidad, 0),
    [carrito],
  )

  const totalItems = useMemo(
    () => carrito.reduce((acc, item) => acc + item.cantidad, 0),
    [carrito],
  )

  const deferredSearch = useDeferredValue(search)
  const [productoPage, setProductoPage] = useState(1)

  // Pre-normalizar una sola vez cuando cambia la lista de productos
  const productosNorm = useMemo(
    () => productos.map((p) => ({
      p,
      n: normalizeSearchText(p.nombre),
      s: normalizeSearchText(p.sku),
      b: normalizeSearchText(p.codigo_barras),
    })),
    [productos],
  )

  const productosFiltrados = useMemo(() => {
    const term = normalizeSearchText(deferredSearch)
    if (!term) return productos
    return productosNorm
      .filter(({ n, s, b }) => n.includes(term) || s.includes(term) || b.includes(term))
      .map(({ p }) => p)
  }, [productos, productosNorm, deferredSearch])

  // Resetear a página 1 cuando cambia el filtro
  useEffect(() => { setProductoPage(1) }, [deferredSearch])

  const productosTotalPages = useMemo(
    () => Math.max(1, Math.ceil(productosFiltrados.length / PRODUCTOS_PAGE_SIZE)),
    [productosFiltrados],
  )

  const productosPaginados = useMemo(
    () => productosFiltrados.slice((productoPage - 1) * PRODUCTOS_PAGE_SIZE, productoPage * PRODUCTOS_PAGE_SIZE),
    [productosFiltrados, productoPage],
  )

  const tryAddByBarcode = (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) return false

    const producto = productos.find((p) => (p.codigo_barras ?? '').trim() === code)
    if (!producto) return false

    addToCart(producto)
    setSearch('')
    searchTypingMeta.current = {
      lastTs: 0,
      isRapidSequence: true,
      prevValue: '',
    }
    return true
  }

  const handleSearchChange = (value: string) => {
    const now = Date.now()
    const previous = searchTypingMeta.current.prevValue
    const growing = value.length >= previous.length && value.startsWith(previous)
    const jump = value.length - previous.length

    if (!value) {
      searchTypingMeta.current = { lastTs: now, isRapidSequence: true, prevValue: '' }
      setSearch('')
      return
    }

    // If many characters arrive at once (paste/scanner burst), treat it as direct input.
    if (jump > 1 && growing) {
      searchTypingMeta.current = { lastTs: now, isRapidSequence: true, prevValue: value }
      if (!tryAddByBarcode(value)) setSearch(value)
      return
    }

    if (!growing) {
      searchTypingMeta.current = { lastTs: now, isRapidSequence: false, prevValue: value }
      setSearch(value)
      return
    }

    const delta = searchTypingMeta.current.lastTs === 0 ? 0 : now - searchTypingMeta.current.lastTs
    const wasRapid = searchTypingMeta.current.isRapidSequence
    const isRapid = wasRapid && (delta === 0 || delta <= 45)

    searchTypingMeta.current = { lastTs: now, isRapidSequence: isRapid, prevValue: value }

    if (isRapid && value.length >= 6 && tryAddByBarcode(value)) {
      return
    }

    setSearch(value)
  }

  const loadProductos = useCallback(async () => {
    // Mostrar cache al instante para no bloquear la UI en conexiones lentas
    const cached = await getProductosFromCache()
    if (cached.length > 0) {
      setProductos(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    if (!navigator.onLine) {
      setLoading(false)
      return
    }

    setRefreshingProductos(true)
    const allProductos: Producto[] = []
    let from = 0

    while (true) {
      const to = from + PRODUCTOS_FETCH_CHUNK - 1
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre')
        .range(from, to)

      if (error) {
        if (cached.length === 0) toast.error(error.message)
        break
      }

      const rows = (data ?? []) as Producto[]
      allProductos.push(...rows)

      if (rows.length < PRODUCTOS_FETCH_CHUNK) break
      from += PRODUCTOS_FETCH_CHUNK
    }

    if (allProductos.length > 0) {
      setProductos(allProductos)
      void saveProductosToCache(allProductos)
    }
    setLoading(false)
    setRefreshingProductos(false)
  }, [])

  const loadClientes = useCallback(async () => {
    // Mostrar cache al instante
    const cached = await getClientesFromCache()
    if (cached.length > 0) setClientes(cached)

    if (!navigator.onLine) return

    const { data, error } = await supabase
      .from('clientes')
      .select('id,nombre,activo')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      if (cached.length === 0) toast.error(`No se pudo obtener clientes: ${error.message}`)
      return
    }

    const clienteIds = (data ?? []).map((c: any) => c.id as number)
    let saldoMap = new Map<number, number>()

    if (clienteIds.length > 0) {
      const { data: saldosData } = await supabase
        .from('creditos_ventas')
        .select('cliente_id, saldo_pendiente')
        .in('cliente_id', clienteIds)
        .not('estado', 'in', '("PAGADO","CANCELADO")')
        .gt('saldo_pendiente', 0)

      for (const row of (saldosData ?? []) as any[]) {
        saldoMap.set(row.cliente_id, (saldoMap.get(row.cliente_id) ?? 0) + Number(row.saldo_pendiente))
      }
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      saldo_deuda: saldoMap.get(row.id) ?? 0,
    })) as ClienteCreditoOption[]

    setClientes(mapped)
    void saveClientesToCache(mapped)
  }, [])

  const loadSummary = useCallback(async () => {
    // Usar fecha_apertura de la caja activa para que al cambiar de día sin hacer corte
    // las ventas de la sesión anterior sigan contando en el resumen
    const startISO = cajaAbierta?.fecha_apertura ?? getTodayStartISO()

    const { data: ventasGlobalesData, error: ventasGlobalesError } = await supabase
      .from('ventas')
      .select('total')
      .eq('estado', 'PAGADA')
      .gte('fecha_venta', startISO)

    if (ventasGlobalesError) {
      toast.error(`Error cargando total global del dia: ${ventasGlobalesError.message}`)
      setSummary(initialSummary)
      return
    }

    const montoTotalDia = (ventasGlobalesData ?? []).reduce((acc, row) => acc + Number(row.total), 0)

    if (!cajaAbierta) {
      setSummary({ ...initialSummary, montoTotalDia })
      return
    }

    const { data: ventasData, error: ventasError } = await supabase
      .from('ventas')
      .select('id,total')
      .eq('estado', 'PAGADA')
      .eq('caja_sesion_id', cajaAbierta.id)
      .gte('fecha_venta', startISO)

    if (ventasError) {
      toast.error(`Error cargando ventas del dia: ${ventasError.message}`)
      setSummary({ ...initialSummary, montoTotalDia })
      return
    }

    const ventasHoy = ventasData?.length ?? 0
    const montoHoy = (ventasData ?? []).reduce((acc, row) => acc + Number(row.total), 0)
    const ventaIds = (ventasData ?? []).map((v) => v.id)

    if (ventaIds.length === 0) {
      setSummary({ ventasHoy, montoHoy, montoTotalDia, unidadesVendidasHoy: 0 })
      return
    }

    const { data: detalleData, error: detalleError } = await supabase
      .from('venta_detalle')
      .select('cantidad')
      .in('venta_id', ventaIds)

    if (detalleError) {
      toast.error(`Error cargando detalle del dia: ${detalleError.message}`)
      setSummary({ ventasHoy, montoHoy, montoTotalDia, unidadesVendidasHoy: 0 })
      return
    }

    const unidadesVendidasHoy = (detalleData ?? []).reduce((acc, row) => acc + Number(row.cantidad), 0)
    setSummary({ ventasHoy, montoHoy, montoTotalDia, unidadesVendidasHoy })
  }, [cajaAbierta])

  const { isOnline, pendingCount, isSyncing, syncPendingVentas, refreshPendingCount } = usePosOfflineSync(loadSummary)

  const verificarCajaAbierta = useCallback(async (showLoading = false) => {
    if (cajaRequestInFlight.current) return
    cajaRequestInFlight.current = true
    if (showLoading) setCajaLoading(true)

    if (!navigator.onLine) {
      const cached = getCajaFromCache()
      setCajaAbierta(cached)
      if (showLoading) setCajaLoading(false)
      cajaRequestInFlight.current = false
      return
    }

    const { data, error } = await supabase
      .from('caja_sesiones')
      .select('id,monto_apertura,fecha_apertura')
      .eq('estado', 'ABIERTA')
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error verificando caja:', error.message)
      const cached = getCajaFromCache()
      if (cached) setCajaAbierta(cached)
      if (showLoading) setCajaLoading(false)
      cajaRequestInFlight.current = false
      return
    }

    const next = data ? { id: data.id as number, monto_apertura: data.monto_apertura as number, fecha_apertura: data.fecha_apertura as string } : null
    saveCajaToCache(next)
    setCajaAbierta((prev) => {
      if (!prev && !next) return prev
      if (prev && next && prev.id === next.id && prev.monto_apertura === next.monto_apertura && prev.fecha_apertura === next.fecha_apertura) return prev
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
          if (config.pauseRefreshOnHiddenTab && document.hidden) return
          void verificarCajaAbierta(false)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && (!config.pauseRefreshOnHiddenTab || !document.hidden)) {
          void verificarCajaAbierta(false)
        }
      })

    const handleVisibilityChange = () => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      void verificarCajaAbierta(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [config.pauseRefreshOnHiddenTab, verificarCajaAbierta])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])
  

  // Refrescar resumen periódicamente solo en pestaña visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      loadSummary()
    }, SUMMARY_POLL_MS)

    return () => clearInterval(interval)
  }, [SUMMARY_POLL_MS, config.pauseRefreshOnHiddenTab, loadSummary])

  // Listener global de teclado — actualizado en cada render para tener closures frescos
  useEffect(() => {
    const handler = (e: KeyboardEvent) => globalKeyHandlerRef.current(e)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

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

  const addQuickItemToCart = () => {
    const precio = Number(productoRapidoPrecio)

    if (!Number.isFinite(precio) || precio <= 0) {
      toast.error('Ingresa un precio mayor a 0')
      return
    }

    const quickCode = generateBaseQuickCode()
    const quickProduct: Producto = {
      id: -Date.now(),
      nombre: 'Adicional',
      descripcion: `Código ${quickCode}`,
      codigo_barras: quickCode,
      sku: quickCode,
      costo_actual: 0,
      precio_actual: Number(precio.toFixed(2)),
      stock_minimo: 0,
      activo: true,
      creado_en: getLocalISOString(),
      actualizado_en: null,
      categoria_id: null,
      proveedor_id: null,
      unidad_medida_id: null,
    }

    setCarrito((prev) => [
      ...prev,
      { producto: quickProduct, cantidad: 1, isQuickItem: true, quickCode },
    ])
    setProductoRapidoPrecio('')
    toast.success('Adicional agregado al carrito')
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

  const finalizarVenta = () => {
    if (!user) { toast.error('No hay sesión activa para registrar la venta.'); return }
    if (!cajaAbierta) { toast.error('No hay caja abierta. Abre una caja desde el módulo Caja.'); return }
    if (carrito.length === 0) { toast.info('Agrega productos al carrito.'); return }
    if (tipoCobro === 'CREDITO' && !clienteCreditoId) { toast.error('Selecciona un cliente para registrar deuda.'); return }

    // Capturar todo antes de limpiar el carrito
    const folio = generateFolio()
    const total = Number(subtotal.toFixed(2))
    const capturedTotalItems = totalItems
    const capturedTipoCobro = tipoCobro
    const estadoVenta = capturedTipoCobro === 'CREDITO' ? 'CANCELADA' : 'PAGADA'
    const regularItems = carrito.filter((item) => !item.isQuickItem)
    const quickItems = carrito.filter((item) => item.isQuickItem)

    let observacion: string | null = capturedTipoCobro === 'CREDITO' ? 'Venta registrada a crédito desde POS' : null
    if (quickItems.length > 0) {
      const quickText = `Adicionales: ${quickItems
        .map((item) => `${item.quickCode ?? 'SIN-CODIGO'}:$${(Number(item.producto.precio_actual) * Number(item.cantidad)).toFixed(2)}`)
        .join(', ')}`
      observacion = observacion ? `${observacion} | ${quickText}` : quickText
    }

    const ventaPayload = {
      caja_sesion_id: cajaAbierta.id,
      usuario_id: user.id,
      folio,
      subtotal: total,
      descuento: 0,
      impuesto: 0,
      total,
      estado: estadoVenta,
      observacion,
      fecha_venta: getLocalISOString(),
    }

    const detallePayload = regularItems.map((item) => {
      const precio = Number(item.producto.precio_actual)
      const cantidad = Number(item.cantidad)
      return {
        producto_id: item.producto.id,
        cantidad,
        precio_unitario: precio,
        descuento: 0,
        subtotal: Number((precio * cantidad).toFixed(2)),
        costo_unitario: Number(item.producto.costo_actual),
      }
    })

    const movimientosPayload = regularItems.map((item) => ({
      producto_id: item.producto.id,
      usuario_id: user.id,
      tipo: 'SALIDA',
      cantidad: Number(item.cantidad),
      costo_unitario: Number(item.producto.costo_actual),
      referencia_tipo: 'VENTA',
      observacion: `Salida por venta ${folio}`,
      fecha_movimiento: getLocalISOString(),
    }))

    const creditoPayload = capturedTipoCobro === 'CREDITO' ? {
      cliente_id: Number(clienteCreditoId),
      usuario_id: user.id,
      fecha_credito: getLocalISOString(),
      total_credito: total,
      saldo_pendiente: total,
      estado: 'PENDIENTE',
      observaciones: `Crédito generado desde POS (${folio})`,
    } : null

    // === OPTIMISTA: liberar UI inmediatamente ===
    setCarrito([])
    setTipoCobro('CONTADO')
    setClienteCreditoId('')
    setSummary((prev) => ({
      ...prev,
      ventasHoy: prev.ventasHoy + 1,
      montoHoy: prev.montoHoy + total,
      montoTotalDia: prev.montoTotalDia + total,
      unidadesVendidasHoy: prev.unidadesVendidasHoy + capturedTotalItems,
    }))
    toast.success(
      capturedTipoCobro === 'CREDITO' ? `Crédito registrado (${folio})` : `Venta: ${folio}`,
      { autoClose: 2000 },
    )

    // === SEGUNDO PLANO: persistir sin bloquear la UI ===
    void (async () => {
      const encolarOffline = async () => {
        await queueVenta({ folio, ventaPayload, detallePayload, movimientosPayload, creditoPayload, createdAt: getLocalISOString() })
        void refreshPendingCount()
        toast.info(`Sin conexión — venta en cola (${folio})`, { autoClose: 3000 })
      }

      if (!navigator.onLine) {
        await encolarOffline()
        return
      }

      const abortCtrl = new AbortController()
      const abortTimer = setTimeout(() => abortCtrl.abort(), SALE_TIMEOUT_MS)

      let ventaId: number
      try {
        const { data: ventaRow, error: ventaError } = await supabase
          .from('ventas')
          .insert([ventaPayload])
          .select('id')
          .abortSignal(abortCtrl.signal)
          .single()

        clearTimeout(abortTimer)

        if (ventaError || !ventaRow) {
          if (isNetworkError(ventaError)) {
            await encolarOffline()
          } else {
            toast.error(ventaError?.message ?? 'No se pudo guardar la venta.')
          }
          return
        }

        ventaId = ventaRow.id as number
      } catch {
        clearTimeout(abortTimer)
        await encolarOffline()
        return
      }

      // Insertar detalle, movimientos y crédito en paralelo
      await Promise.all([
        detallePayload.length > 0
          ? supabase.from('venta_detalle')
              .insert(detallePayload.map((d) => ({ ...d, venta_id: ventaId })))
              .then(({ error }) => { if (error) console.error('Detalle venta:', error.message) })
          : Promise.resolve(),
        movimientosPayload.length > 0
          ? supabase.from('inventario_movimientos')
              .insert(movimientosPayload.map((m) => ({ ...m, referencia_id: ventaId })))
              .then(({ error }) => { if (error) console.warn('Movimiento inventario:', error.message) })
          : Promise.resolve(),
        creditoPayload
          ? supabase.from('creditos_ventas')
              .insert([{ ...creditoPayload, venta_id: ventaId }])
              .then(({ error }) => { if (error) console.warn('Crédito venta:', error.message) })
          : Promise.resolve(),
      ])
    })()
  }

  const hacerCorte = async () => {
    if (!user) {
      toast.error('No hay sesión activa para hacer corte.')
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
        usuario_id: user.id,
        fecha_corte: getLocalISOString(),
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
        empleado_cierre_id: user.id,
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

  // Actualizar ref en cada render para capturar closures actuales
  globalKeyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement

    // ESC: finalizar venta (excepto en selects donde cierra el dropdown)
    if (e.key === 'Escape') {
      if (target.tagName === 'SELECT') return
      e.preventDefault()
      finalizarVenta()
      return
    }

    // Si ya hay un input de texto enfocado, no interceptar — el input maneja el tecleo
    const isTypingInput =
      (target.tagName === 'INPUT' &&
        !['button', 'submit', 'checkbox', 'radio'].includes((target as HTMLInputElement).type)) ||
      target.tagName === 'TEXTAREA'

    if (isTypingInput) return

    // Acumular caracteres del lector de barras (llegan en ráfaga < 100 ms entre cada uno)
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const now = Date.now()
      const delta = barcodeLastKeyRef.current === 0 ? 0 : now - barcodeLastKeyRef.current
      if (delta > 100) barcodeBufferRef.current = ''
      barcodeLastKeyRef.current = now
      barcodeBufferRef.current += e.key

      if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current)
      barcodeTimerRef.current = setTimeout(() => {
        const code = barcodeBufferRef.current.trim()
        barcodeBufferRef.current = ''
        barcodeLastKeyRef.current = 0
        if (code.length >= 4 && !tryAddByBarcode(code)) {
          setSearch(code)
          searchInputRef.current?.focus()
        }
      }, 80)
      return
    }

    // Enter: intentar código inmediatamente (los lectores envían Enter al final)
    if (e.key === 'Enter') {
      if (barcodeTimerRef.current) {
        clearTimeout(barcodeTimerRef.current)
        barcodeTimerRef.current = null
      }
      const code = barcodeBufferRef.current.trim()
      barcodeBufferRef.current = ''
      barcodeLastKeyRef.current = 0
      if (code.length >= 4 && !tryAddByBarcode(code)) {
        setSearch(code)
        searchInputRef.current?.focus()
      }
    }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <ShoppingCart className="text-indigo-600" size={24} />
            <h1 className="text-2xl font-bold text-gray-800">Punto de Venta</h1>
            {cajaLoading === false && (
              cajaAbierta
                ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Caja abierta
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                    <AlertCircle size={11} className="shrink-0" />
                    Sin caja — ve al módulo Caja
                  </span>
                )
            )}
          </div>
          <button
            onClick={hacerCorte}
            disabled={haciendoCorte || !cajaAbierta}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <Wallet size={16} />
            {haciendoCorte ? 'Generando corte...' : 'Hacer corte'}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
            <p className="text-[11px] text-gray-500 uppercase">Apertura</p>
            <p className="text-sm sm:text-base font-semibold text-gray-800">
              ${Number(cajaAbierta?.monto_apertura ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
            <p className="text-[11px] text-gray-500 uppercase">Ventas del dia</p>
            <p className="text-sm sm:text-base font-semibold text-gray-800">{summary.ventasHoy}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
            <p className="text-[11px] text-gray-500 uppercase">Monto del dia</p>
            <p className="text-sm sm:text-base font-semibold text-emerald-700">${summary.montoHoy.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
            <p className="text-[11px] text-gray-500 uppercase">Total global dia</p>
            <p className="text-sm sm:text-base font-semibold text-blue-700">${summary.montoTotalDia.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
            <p className="text-[11px] text-gray-500 uppercase">Unidades</p>
            <p className="text-sm sm:text-base font-semibold text-indigo-700">
              {summary.unidadesVendidasHoy.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">Sin conexión</span>
          <span className="text-amber-700">— las ventas se guardan localmente y se sincronizan al recuperar internet.</span>
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-blue-800">
            {pendingCount} venta{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''} de sincronizar
          </span>
          <button
            onClick={() => void syncPendingVentas()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-col gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void tryAddByBarcode(search)
                    }
                  }}
                  placeholder="Buscar por nombre, SKU o codigo de barras"
                  className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2">
                <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 bg-gray-50 flex items-center">
                  Adicional
                </div>
                <input
                  value={productoRapidoPrecio}
                  onChange={(event) => setProductoRapidoPrecio(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addQuickItemToCart()
                    }
                  }}
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Precio"
                />
                <button
                  type="button"
                  onClick={addQuickItemToCart}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Plus size={14} />
                  Agregar rápido
                </button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Solo ingresa el precio y presiona agregar. Se genera un código interno único para la venta.
                </p>
                {refreshingProductos && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <RefreshCw size={11} className="animate-spin" />
                    Actualizando...
                  </span>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Cargando productos...</div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {productosPaginados.map((producto) => (
                  <div key={producto.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-800">{producto.nombre}</p>
                      <p className="text-xs text-gray-500">SKU: {producto.sku ?? 'N/A'} | Codigo: {producto.codigo_barras ?? 'N/A'}</p>
                    </div>
                    <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-3">
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
                {productosFiltrados.length === 0 && (
                  <div className="p-8 text-center text-sm text-gray-400">No hay productos para mostrar.</div>
                )}
              </div>

              {productosFiltrados.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span>{productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setProductoPage((p) => Math.max(1, p - 1))}
                      disabled={productoPage <= 1}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="px-2">{productoPage}/{productosTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setProductoPage((p) => Math.min(productosTotalPages, p + 1))}
                      disabled={productoPage >= productosTotalPages}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
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
                      {cliente.saldo_deuda > 0 ? ` • Debe: $${Number(cliente.saldo_deuda).toFixed(2)}` : ' • Sin deuda'}
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
              disabled={!carrito.length || !cajaAbierta}
              className="w-full mt-2 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
              title={!cajaAbierta ? 'Abre una caja para vender' : ''}
            >
              Finalizar venta
            </button>
          </div>
        </section>
      </div>

    </div>
  )
}
