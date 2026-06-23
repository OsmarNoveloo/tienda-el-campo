import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  Wallet,
  Clock3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { useSystemConfig } from '../../hooks/useSystemConfig'
import { api } from '../../lib/apiClient'
import { formatDateTime, formatDate } from '../../lib/dateUtils'
import { normalizeSearchText } from '../../lib/searchUtils'
import type { CreditoVenta, EstadoCredito } from '../../types/database'

type CreditoEstadoNormalizado = EstadoCredito | 'PENDIENTE'

type AbonoDetalle = AbonoCredito & {
  usuario_nombre: string
}

type CreditoRow = CreditoVenta & {
  cliente_nombre: string
  cliente_telefono: string | null
  venta_folio: string
  usuario_nombre: string
  abonos: AbonoDetalle[]
  total_abonado: number
  saldo_actual: number
  estado_normalizado: CreditoEstadoNormalizado
}

const abonoSchema = z.object({
  monto: z.coerce.number().positive('Ingresa un monto mayor a 0'),
  observacion: z.string().optional(),
})

type AbonoFormInput = z.input<typeof abonoSchema>
type AbonoFormOutput = z.output<typeof abonoSchema>

type ActionMode = 'abono' | 'liquidar'

type ClienteDeudaRow = {
  cliente_id: number
  cliente_nombre: string
  cliente_telefono: string | null
  total_deuda: number
  creditos_activos: number
}

function formatMoney(value: number) {
  return `$${Number(value).toFixed(2)}`
}

function getEstadoColor(estado: CreditoEstadoNormalizado, saldo: number) {
  if (estado === 'PAGADO' || saldo <= 0) return 'bg-emerald-100 text-emerald-700'
  if (estado === 'VENCIDO') return 'bg-rose-100 text-rose-700'
  if (estado === 'CANCELADO') return 'bg-gray-100 text-gray-600'
  if (estado === 'ABONANDO') return 'bg-amber-100 text-amber-700'
  return 'bg-sky-100 text-sky-700'
}

function getEstadoLabel(estado: CreditoEstadoNormalizado, saldo: number) {
  if (estado === 'PAGADO' || saldo <= 0) return 'Liquidado'
  if (estado === 'VENCIDO') return 'Vencido'
  if (estado === 'CANCELADO') return 'Cancelado'
  if (estado === 'ABONANDO') return 'Abonando'
  return 'Pendiente'
}

export default function CreditosPage() {
  const PAGE_SIZE_OPTIONS = [20, 50, 100]
  const { user } = useAuth()
  const { config } = useSystemConfig()
  const [creditos, setCreditos] = useState<CreditoRow[]>([])
  const [totalCreditosCount, setTotalCreditosCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterEstado, setFilterEstado] = useState<'TODOS' | CreditoEstadoNormalizado>('TODOS')
  const [expandedCreditoId, setExpandedCreditoId] = useState<number | null>(null)
  const [actionMode, setActionMode] = useState<ActionMode>('abono')
  const [selectedCredito, setSelectedCredito] = useState<CreditoRow | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [vistaMode, setVistaMode] = useState<'creditos' | 'clientes'>('creditos')
  const [clientesDeuda, setClientesDeuda] = useState<ClienteDeudaRow[]>([])
  const [loadingClientesDeuda, setLoadingClientesDeuda] = useState(false)
  const [selectedClienteDeuda, setSelectedClienteDeuda] = useState<ClienteDeudaRow | null>(null)
  const [isClienteMode, setIsClienteMode] = useState(false)
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<AbonoFormInput, unknown, AbonoFormOutput>({
    resolver: zodResolver(abonoSchema),
    mode: 'onChange',
    defaultValues: {
      monto: 0,
      observacion: '',
    },
  })
  const montoActual = Number(watch('monto') ?? 0)
  const canSubmitAbono = actionMode === 'liquidar' ? true : isValid && montoActual > 0

  const loadCreditos = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
        ...(deferredSearchTerm.trim() ? { search: normalizeSearchText(deferredSearchTerm) } : {}),
        ...(filterEstado !== 'TODOS' ? { estado: filterEstado } : {}),
      })
      const { items, total } = await api.get<{ items: CreditoRow[]; total: number }>(`/creditos?${params}`)
      setCreditos(items)
      setTotalCreditosCount(total)
      setLastUpdatedAt(new Date())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando créditos'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [currentPage, deferredSearchTerm, filterEstado, pageSize])

  const loadClientesDeuda = useCallback(async () => {
    setLoadingClientesDeuda(true)
    try {
      const data = await api.get<ClienteDeudaRow[]>('/creditos/deuda-clientes')
      setClientesDeuda(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error cargando deudas por cliente')
    } finally {
      setLoadingClientesDeuda(false)
    }
  }, [])

  useEffect(() => {
    void loadCreditos()
  }, [loadCreditos])

  useEffect(() => {
    if (vistaMode === 'clientes') void loadClientesDeuda()
  }, [vistaMode, loadClientesDeuda])

  useEffect(() => {
    const refreshMs = config.creditosRefreshSeconds * 1000

    const interval = setInterval(() => {
      if (config.pauseRefreshOnHiddenTab && document.hidden) return
      void loadCreditos()
    }, refreshMs)

    return () => clearInterval(interval)
  }, [config.creditosRefreshSeconds, config.pauseRefreshOnHiddenTab, loadCreditos])

  const filteredCreditos = creditos

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCreditosCount / pageSize)), [pageSize, totalCreditosCount])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const resumen = useMemo(() => {
    const totalPendiente = filteredCreditos.reduce((acc, credito) => acc + Number(credito.saldo_actual), 0)
    const totalCreditos = filteredCreditos.length
    const totalLiquidado = filteredCreditos.filter((credito) => credito.estado_normalizado === 'PAGADO' || credito.saldo_actual <= 0).length
    const totalAbonado = filteredCreditos.reduce((acc, credito) => acc + Number(credito.total_abonado), 0)

    return { totalPendiente, totalCreditos, totalLiquidado, totalAbonado }
  }, [filteredCreditos])

  const openActionModal = (credito: CreditoRow, mode: ActionMode) => {
    setIsClienteMode(false)
    setSelectedClienteDeuda(null)
    setSelectedCredito(credito)
    setActionMode(mode)
    setModalOpen(true)
    reset({
      monto: mode === 'liquidar' ? credito.saldo_actual : 0,
      observacion: '',
    })
  }

  const openClienteModal = (clienteDeuda: ClienteDeudaRow, mode: ActionMode) => {
    setIsClienteMode(true)
    setSelectedCredito(null)
    setSelectedClienteDeuda(clienteDeuda)
    setActionMode(mode)
    setModalOpen(true)
    reset({
      monto: mode === 'liquidar' ? clienteDeuda.total_deuda : 0,
      observacion: '',
    })
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedCredito(null)
    setSelectedClienteDeuda(null)
    setIsClienteMode(false)
    reset({ monto: 0, observacion: '' })
  }

  const submitAbono = async (values: AbonoFormOutput) => {
    if (!user) {
      toast.error('No hay sesión activa para registrar el abono')
      return
    }

    if (isClienteMode && selectedClienteDeuda) {
      const saldoTotal = selectedClienteDeuda.total_deuda
      const montoFinal = actionMode === 'liquidar' ? saldoTotal : Number(values.monto)

      if (montoFinal <= 0) { toast.error('El monto debe ser mayor a 0'); return }
      if (montoFinal > saldoTotal + 0.001) { toast.error('El abono no puede superar la deuda total del cliente'); return }

      try {
        await api.post('/creditos/pagar-cliente', {
          cliente_id: selectedClienteDeuda.cliente_id,
          monto: Number(montoFinal.toFixed(2)),
          observacion: values.observacion?.trim() || null,
          usuario_id: user.id,
        })
        toast.success(
          actionMode === 'liquidar'
            ? `Deuda de ${selectedClienteDeuda.cliente_nombre} liquidada`
            : `Abono registrado para ${selectedClienteDeuda.cliente_nombre}`,
        )
        closeModal()
        await Promise.all([loadClientesDeuda(), loadCreditos()])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al registrar pago')
      }
      return
    }

    if (!selectedCredito) { toast.error('Selecciona un crédito'); return }

    const saldoDisponible = Number(selectedCredito.saldo_actual)
    const montoFinal = actionMode === 'liquidar' ? saldoDisponible : Number(values.monto)

    if (montoFinal <= 0) { toast.error('El monto debe ser mayor a 0'); return }
    if (montoFinal > saldoDisponible) { toast.error('El abono no puede ser mayor al saldo pendiente'); return }

    try {
      await api.post(`/creditos/${selectedCredito.id}/abonos`, {
        monto: Number(montoFinal.toFixed(2)),
        observacion: values.observacion?.trim() || null,
        usuario_id: user.id,
      })
      toast.success(montoFinal >= saldoDisponible ? 'Crédito liquidado' : 'Abono registrado')
      closeModal()
      await loadCreditos()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar abono')
    }
  }

  const toggleExpand = (creditoId: number) => {
    setExpandedCreditoId((current) => (current === creditoId ? null : creditoId))
  }

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Sin actualizar todavía'

    const diffMs = Date.now() - lastUpdatedAt.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)

    if (diffSeconds < 60) return `Actualizado hace ${diffSeconds || 1}s`

    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) return `Actualizado hace ${diffMinutes}m`

    const diffHours = Math.floor(diffMinutes / 60)
    return `Actualizado hace ${diffHours}h`
  }, [lastUpdatedAt])

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
              <CreditCard size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Créditos</h1>
              <p className="text-sm text-gray-500">Créditos otorgados, abonos y liquidaciones en un solo panel.</p>
            </div>
          </div>

          <button
            onClick={() => void loadCreditos()}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:self-auto"
          >
            <RefreshCw size={14} />
            Actualizar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 font-medium text-gray-600">
            <Clock3 size={12} />
            {lastUpdatedLabel}
          </span>
          <span className="text-gray-400">El historial se refresca automáticamente cada {config.creditosRefreshSeconds} segundos.</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Créditos visibles</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{totalCreditosCount}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Saldo pendiente</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{formatMoney(resumen.totalPendiente)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Abonado</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">{formatMoney(resumen.totalAbonado)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Liquidados</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{resumen.totalLiquidado}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
        {/* Toggle vista */}
        <div className="flex gap-1 rounded-lg border border-gray-200 overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setVistaMode('creditos')}
            className={`px-4 py-1.5 text-xs font-semibold transition-colors ${vistaMode === 'creditos' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Por crédito
          </button>
          <button
            type="button"
            onClick={() => setVistaMode('clientes')}
            className={`px-4 py-1.5 text-xs font-semibold transition-colors ${vistaMode === 'clientes' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Por cliente
          </button>
        </div>

        {vistaMode === 'creditos' && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Buscar por cliente, folio o usuario"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                value={filterEstado}
                onChange={(e) => {
                  setFilterEstado(e.target.value as typeof filterEstado)
                  setCurrentPage(1)
                }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="ABONANDO">Abonando</option>
                <option value="PAGADO">Liquidados</option>
                <option value="VENCIDO">Vencidos</option>
                <option value="CANCELADO">Cancelados</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Vista por cliente ── */}
      {vistaMode === 'clientes' && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {loadingClientesDeuda ? (
            <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-400">
              <Loader2 className="animate-spin" size={16} />
              Cargando...
            </div>
          ) : clientesDeuda.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto mb-3 text-emerald-300" size={48} />
              <p className="text-sm text-gray-400">Sin deudas pendientes. ¡Todos al corriente!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                    <th className="px-4 py-3 text-center font-semibold">Créditos activos</th>
                    <th className="px-4 py-3 text-right font-semibold">Deuda total</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientesDeuda.map((cliente) => (
                    <tr key={cliente.cliente_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-800">{cliente.cliente_nombre}</span>
                          <span className="text-xs text-gray-500">{cliente.cliente_telefono ?? 'Sin teléfono'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{cliente.creditos_activos}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">{formatMoney(cliente.total_deuda)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            onClick={() => openClienteModal(cliente, 'abono')}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Wallet size={13} />
                            Abonar
                          </button>
                          <button
                            onClick={() => openClienteModal(cliente, 'liquidar')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={13} />
                            Liquidar todo
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Vista por crédito ── */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden" style={{ display: vistaMode === 'creditos' ? undefined : 'none' }}>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-400">
            <Loader2 className="animate-spin" size={16} />
            Cargando créditos...
          </div>
        ) : filteredCreditos.length === 0 ? (
          <div className="p-10 text-center">
            <ReceiptText className="mx-auto mb-3 text-gray-300" size={48} />
            <p className="text-sm text-gray-400">No hay créditos para mostrar.</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-245 text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="w-8 px-4 py-3"></th>
                  <th className="px-4 py-3 text-left font-semibold">Folio</th>
                  <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCreditos.map((credito) => {
                  const expanded = expandedCreditoId === credito.id
                  const saldo = Number(credito.saldo_actual)

                  return (
                    <Fragment key={credito.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 align-top">
                          <button
                            onClick={() => toggleExpand(credito.id)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600"
                            title={expanded ? 'Ocultar detalle' : 'Ver detalle'}
                          >
                            <Plus size={14} className={`transition-transform ${expanded ? 'rotate-45' : ''}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{credito.venta_folio}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="flex flex-col">
                            <span className="font-medium">{credito.cliente_nombre}</span>
                            <span className="text-xs text-gray-500">{credito.cliente_telefono ?? 'Sin teléfono'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDateTime(credito.fecha_credito)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatMoney(Number(credito.total_credito))}</td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatMoney(saldo)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getEstadoColor(credito.estado_normalizado, saldo)}`}>
                            {getEstadoLabel(credito.estado_normalizado, saldo)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              onClick={() => openActionModal(credito, 'abono')}
                              disabled={saldo <= 0 || credito.estado_normalizado === 'CANCELADO'}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Wallet size={13} />
                              Abonar
                            </button>
                            <button
                              onClick={() => openActionModal(credito, 'liquidar')}
                              disabled={saldo <= 0 || credito.estado_normalizado === 'CANCELADO'}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              Liquidar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td colSpan={8} className="bg-gray-50 px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                              <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <h3 className="text-sm font-semibold text-gray-800">Detalle del crédito</h3>
                                    <p className="text-xs text-gray-500">Otorgado por {credito.usuario_nombre}</p>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <CalendarDays size={13} />
                                    {credito.fecha_vencimiento ? `Vence ${formatDate(credito.fecha_vencimiento)}` : 'Sin fecha de vencimiento'}
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-xs">
                                  <div className="rounded-lg bg-gray-50 p-3">
                                    <p className="text-gray-500">Total crédito</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-800">{formatMoney(Number(credito.total_credito))}</p>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-3">
                                    <p className="text-gray-500">Total abonado</p>
                                    <p className="mt-1 text-sm font-semibold text-indigo-700">{formatMoney(Number(credito.total_abonado))}</p>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-3">
                                    <p className="text-gray-500">Saldo actual</p>
                                    <p className="mt-1 text-sm font-semibold text-rose-600">{formatMoney(saldo)}</p>
                                  </div>
                                  <div className="rounded-lg bg-gray-50 p-3">
                                    <p className="text-gray-500">Estado interno</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-800">{credito.estado ?? 'PENDIENTE'}</p>
                                  </div>
                                </div>

                                {credito.observaciones && (
                                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Observaciones</p>
                                    <p className="mt-1 text-sm">{credito.observaciones}</p>
                                  </div>
                                )}

                                <div className="mt-4 flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-gray-800">Abonos registrados</h4>
                                  <button
                                    onClick={() => openActionModal(credito, 'abono')}
                                    disabled={saldo <= 0 || credito.estado_normalizado === 'CANCELADO'}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Plus size={13} />
                                    Nuevo abono
                                  </button>
                                </div>

                                <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
                                  {credito.abonos.length > 0 ? (
                                    credito.abonos.map((abono) => (
                                      <div key={abono.id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 text-gray-700">
                                            <DollarSign size={12} className="text-emerald-600" />
                                            <span className="font-semibold text-gray-800">{formatMoney(Number(abono.monto))}</span>
                                            <span className="text-gray-400">por</span>
                                            <span>{abono.usuario_nombre}</span>
                                          </div>
                                          <span className="text-gray-500">{formatDateTime(abono.fecha_abono)}</span>
                                        </div>
                                        <div className="mt-1 flex items-start justify-between gap-3 text-gray-500">
                                          <span>{abono.observacion ?? 'Sin observación'}</span>
                                          <span>Método ID: {abono.metodo_pago_id ?? 'N/A'}</span>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                                      No hay abonos registrados para este crédito.
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-gray-800">Resumen rápido</h4>
                                <div className="mt-3 space-y-3 text-sm">
                                  <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                    <span className="text-gray-500">Cliente</span>
                                    <span className="font-medium text-gray-800">{credito.cliente_nombre}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                    <span className="text-gray-500">Folio</span>
                                    <span className="font-medium text-gray-800">{credito.venta_folio}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                    <span className="text-gray-500">Registrado por</span>
                                    <span className="font-medium text-gray-800">{credito.usuario_nombre}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                    <span className="text-gray-500">Abonos</span>
                                    <span className="font-medium text-gray-800">{credito.abonos.length}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                    <span className="text-gray-500">Liquidación inmediata</span>
                                    <span className="font-medium text-gray-800">{formatMoney(saldo)}</span>
                                  </div>
                                </div>

                                <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                                  <div className="flex items-start gap-2">
                                    <Clock3 size={16} className="mt-0.5" />
                                    <p>
                                      Si un crédito llega a saldo cero, se marca como <span className="font-semibold">Liquidado</span> y deja de aparecer como pendiente.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
            <p>Pagina {currentPage} de {totalPages} · {totalCreditosCount} créditos</p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                aria-label="Créditos por página"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}/pag</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 py-1 text-xs rounded-md bg-gray-50 border border-gray-200">{currentPage}/{totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                aria-label="Página siguiente"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {modalOpen && (selectedCredito || selectedClienteDeuda) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {actionMode === 'liquidar'
                  ? isClienteMode ? 'Liquidar deuda del cliente' : 'Liquidar crédito'
                  : isClienteMode ? 'Abonar a deuda del cliente' : 'Registrar abono'}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {isClienteMode
                  ? selectedClienteDeuda!.cliente_nombre
                  : `${selectedCredito!.cliente_nombre} — ${selectedCredito!.venta_folio}`}
              </p>
            </div>

            <form onSubmit={handleSubmit(submitAbono)} className="space-y-4 p-5">
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                {isClienteMode ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Deuda total del cliente</span>
                      <span className="font-semibold text-rose-600">{formatMoney(selectedClienteDeuda!.total_deuda)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>Créditos activos</span>
                      <span>{selectedClienteDeuda!.creditos_activos}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">El pago se distribuye del crédito más antiguo al más reciente.</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Saldo pendiente</span>
                      <span className="font-semibold text-rose-600">{formatMoney(selectedCredito!.saldo_actual)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>Total crédito</span>
                      <span>{formatMoney(Number(selectedCredito!.total_credito))}</span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Monto</label>
                <input
                  {...register('monto')}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={actionMode === 'liquidar'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                />
                {errors.monto && <p className="mt-1 text-xs text-rose-600">{errors.monto.message}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Observacion</label>
                <textarea
                  {...register('observacion')}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !canSubmitAbono}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Guardando...
                    </>
                  ) : actionMode === 'liquidar' ? (
                    <>
                      <CheckCircle2 size={14} />
                      Liquidar
                    </>
                  ) : (
                    <>
                      <Wallet size={14} />
                      Registrar abono
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
