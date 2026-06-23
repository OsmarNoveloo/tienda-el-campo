import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, DollarSign, ClipboardList, Plus, Pencil, Check } from 'lucide-react'
import { toast } from 'react-toastify'
import { api } from '../../lib/apiClient'
import type { Proveedor, ProveedorPago, ProveedorPedido } from '../../types/database'

const DIAS_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function getMondayOfWeek(offset: number): Date {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekDates(offset: number): Date[] {
  const monday = getMondayOfWeek(offset)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekLabel(dates: Date[]): string {
  const start = dates[0]
  const end = dates[5]
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MESES[start.getMonth()]} ${start.getFullYear()}`
  }
  return `${start.getDate()} ${MESES[start.getMonth()]} – ${end.getDate()} ${MESES[end.getMonth()]} ${end.getFullYear()}`
}

function formatCurrency(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function fechaLarga(fechaStr: string): string {
  const d = new Date(fechaStr + 'T12:00:00')
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  return `${dias[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`
}

interface DetailModal {
  proveedor: Proveedor
  fecha: string
}

interface Props {
  proveedores: Proveedor[]
}

export default function ProveedoresSemana({ proveedores }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [pagos, setPagos] = useState<ProveedorPago[]>([])
  const [pedidos, setPedidos] = useState<ProveedorPedido[]>([])
  const [loading, setLoading] = useState(false)

  // Modal de detalle
  const [detail, setDetail] = useState<DetailModal | null>(null)
  const [pedidoText, setPedidoText] = useState('')
  const [editingPedido, setEditingPedido] = useState(false)
  const [montoInput, setMontoInput] = useState('')
  const [notasInput, setNotasInput] = useState('')
  const [savingPedido, setSavingPedido] = useState(false)
  const [savingPago, setSavingPago] = useState(false)

  const weekDates = getWeekDates(weekOffset)

  // ── Carga de datos ──────────────────────────────────────────────
  const loadWeekData = useCallback(async () => {
    const dates = getWeekDates(weekOffset)
    const from = toDateStr(dates[0])
    const to   = toDateStr(dates[5])
    setLoading(true)
    try {
      const { pagos: pagosData, pedidos: pedidosData } = await api.get<{ pagos: ProveedorPago[]; pedidos: ProveedorPedido[] }>(
        `/proveedores/semana?from=${from}&to=${to}`,
      )
      setPagos(pagosData)
      setPedidos(pedidosData)
    } catch {
      toast.error('Error cargando datos de la semana')
    } finally {
      setLoading(false)
    }
  }, [weekOffset])

  useEffect(() => { loadWeekData() }, [loadWeekData])

  // ── Helpers ─────────────────────────────────────────────────────
  const getPagosParaDia  = (id: number, f: string) => pagos.filter(p => p.proveedor_id === id && p.fecha === f)
  const getPedidoParaDia = (id: number, f: string) => pedidos.find(p => p.proveedor_id === id && p.fecha === f)

  const activosConDias = proveedores.filter(p => p.activo && p.dias_visita && p.dias_visita.length > 0)
  const todayStr = toDateStr(new Date())
  const totalSemana = pagos.reduce((s, p) => s + Number(p.monto), 0)

  // ── Abrir detalle ───────────────────────────────────────────────
  const openDetail = (proveedor: Proveedor, fecha: string) => {
    const existingPedido = getPedidoParaDia(proveedor.id, fecha)
    setDetail({ proveedor, fecha })
    setPedidoText(existingPedido?.pedido ?? '')
    setEditingPedido(!existingPedido)
    setMontoInput('')
    setNotasInput('')
  }

  const closeDetail = () => {
    if (savingPedido || savingPago) return
    setDetail(null)
  }

  // ── Guardar pedido ──────────────────────────────────────────────
  const savePedido = async () => {
    if (!detail || !pedidoText.trim()) return
    setSavingPedido(true)

    const existing = getPedidoParaDia(detail.proveedor.id, detail.fecha)

    try {
      if (existing) {
        await api.patch(`/proveedores/pedidos/${existing.id}`, { pedido: pedidoText.trim() })
      } else {
        await api.post(`/proveedores/${detail.proveedor.id}/pedidos`, {
          fecha: detail.fecha,
          pedido: pedidoText.trim(),
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar pedido')
      setSavingPedido(false)
      return
    }

    toast.success('Pedido guardado')
    setSavingPedido(false)
    setEditingPedido(false)
    await loadWeekData()
  }

  // ── Guardar pago ─────────────────────────────────────────────────
  const savePago = async () => {
    if (!detail) return
    const montoNum = parseFloat(montoInput)
    if (isNaN(montoNum) || montoNum <= 0) { toast.error('Ingresa un monto válido'); return }
    setSavingPago(true)

    try {
      await api.post(`/proveedores/${detail.proveedor.id}/pagos`, {
        fecha: detail.fecha,
        monto: montoNum,
        notas: notasInput.trim() || null,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar pago')
      setSavingPago(false)
      return
    }

    toast.success('Pago registrado')
    setMontoInput('')
    setNotasInput('')
    setSavingPago(false)
    await loadWeekData()
  }

  // ── Datos del modal abierto ──────────────────────────────────────
  const detailPagos   = detail ? getPagosParaDia(detail.proveedor.id, detail.fecha) : []
  const detailPedido  = detail ? getPedidoParaDia(detail.proveedor.id, detail.fecha) : undefined
  const detailTotal   = detailPagos.reduce((s, p) => s + Number(p.monto), 0)

  return (
    <div className="space-y-4">
      {/* ── Navegación semana ─────────────────────────────────── */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">{weekLabel(weekDates)}</p>
          <div className="flex items-center justify-center gap-3 mt-0.5">
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="text-xs text-indigo-600 hover:underline">
                Hoy
              </button>
            )}
            {totalSemana > 0 && (
              <p className="text-xs text-gray-400">
                Total semana: <span className="font-semibold text-gray-600">{formatCurrency(totalSemana)}</span>
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Grid semanal ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {weekDates.map((date, dayIdx) => {
          const dateStr = toDateStr(date)
          const isToday = dateStr === todayStr
          const provsDia = activosConDias.filter(p => p.dias_visita!.includes(dayIdx))
          const totalDia = pagos.filter(p => p.fecha === dateStr).reduce((s, p) => s + Number(p.monto), 0)

          return (
            <div
              key={dayIdx}
              className={`rounded-xl border p-2 space-y-2 min-h-36 ${
                isToday ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-100 bg-white'
              }`}
            >
              {/* Encabezado día */}
              <div className="text-center pb-1 border-b border-gray-100">
                <p className={`text-xs font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {DIAS_LABELS[dayIdx]}
                </p>
                <p className={`text-base font-bold leading-tight ${isToday ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {date.getDate()}
                </p>
                {totalDia > 0 && (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">{formatCurrency(totalDia)}</p>
                )}
              </div>

              {/* Tarjetas de proveedores */}
              <div className="space-y-1.5">
                {provsDia.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center pt-1">—</p>
                ) : (
                  provsDia.map(prov => {
                    const pagosDia  = getPagosParaDia(prov.id, dateStr)
                    const pedidoDia = getPedidoParaDia(prov.id, dateStr)
                    const totalProv = pagosDia.reduce((s, p) => s + Number(p.monto), 0)

                    return (
                      <button
                        key={prov.id}
                        onClick={() => openDetail(prov, dateStr)}
                        className="w-full text-left bg-white rounded-lg border border-gray-200 px-2 py-1.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
                          {prov.nombre}
                        </p>
                        <div className="mt-0.5 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {pedidoDia && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                                <ClipboardList size={10} />
                                Pedido
                              </span>
                            )}
                            {totalProv > 0 && (
                              <span className="text-xs text-emerald-600 font-medium">
                                {formatCurrency(totalProv)}
                              </span>
                            )}
                            {!pedidoDia && totalProv === 0 && (
                              <span className="text-xs text-gray-400">Registrar</span>
                            )}
                          </div>
                          {pagosDia.map(p => p.notas).filter(Boolean).map((nota, i) => (
                            <p key={i} className="text-xs text-gray-400 truncate">{nota}</p>
                          ))}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {activosConDias.length === 0 && (
        <p className="text-center py-10 text-sm text-gray-400">
          Ningún proveedor tiene días configurados. Edítalos para asignarles días de visita.
        </p>
      )}

      {loading && <p className="text-center text-xs text-gray-400">Cargando...</p>}

      {/* ── Modal de detalle ──────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl border border-gray-100 shadow-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-800">{detail.proveedor.nombre}</h2>
                <p className="text-xs text-gray-500 capitalize">{fechaLarga(detail.fecha)}</p>
              </div>
              <button
                onClick={closeDetail}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* ── Sección Pedido ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <ClipboardList size={15} className="text-amber-500" />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Pedido</span>
                  </div>
                  {detailPedido && !editingPedido && (
                    <button
                      onClick={() => { setPedidoText(detailPedido.pedido); setEditingPedido(true) }}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      <Pencil size={11} />
                      Editar
                    </button>
                  )}
                </div>

                {editingPedido ? (
                  <div className="space-y-2">
                    <textarea
                      value={pedidoText}
                      onChange={e => setPedidoText(e.target.value)}
                      placeholder="Escribe aquí el pedido del día..."
                      rows={4}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2">
                      {detailPedido && (
                        <button
                          type="button"
                          onClick={() => { setPedidoText(detailPedido.pedido); setEditingPedido(false) }}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50"
                          disabled={savingPedido}
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        onClick={savePedido}
                        disabled={savingPedido || !pedidoText.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                      >
                        <Check size={12} />
                        {savingPedido ? 'Guardando...' : 'Guardar pedido'}
                      </button>
                    </div>
                  </div>
                ) : detailPedido ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailPedido.pedido}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingPedido(true)}
                    className="w-full border-2 border-dashed border-gray-200 rounded-lg py-3 text-xs text-gray-400 hover:border-amber-300 hover:text-amber-500 transition-colors"
                  >
                    <Plus size={12} className="inline mr-1" />
                    Agregar pedido del día
                  </button>
                )}
              </div>

              {/* ── Sección Pagos ── */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign size={15} className="text-emerald-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Pago</span>
                  {detailTotal > 0 && (
                    <span className="ml-auto text-sm font-bold text-emerald-600">{formatCurrency(detailTotal)}</span>
                  )}
                </div>

                {/* Pagos registrados */}
                {detailPagos.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {detailPagos.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <div>
                          <span className="text-sm font-semibold text-emerald-700">{formatCurrency(Number(p.monto))}</span>
                          {p.notas && <p className="text-xs text-gray-500 mt-0.5">{p.notas}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Registrar nuevo pago */}
                <div className="space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs text-gray-500 font-medium">
                    {detailPagos.length > 0 ? 'Agregar otro pago' : 'Registrar pago'}
                  </p>
                  <div className="relative">
                    <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      value={montoInput}
                      onChange={e => setMontoInput(e.target.value)}
                      placeholder="0.00"
                      min="0.01"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                      onKeyDown={e => { if (e.key === 'Enter') savePago() }}
                    />
                  </div>
                  <input
                    value={notasInput}
                    onChange={e => setNotasInput(e.target.value)}
                    placeholder="Notas (opcional)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                  <button
                    onClick={savePago}
                    disabled={savingPago || !montoInput || parseFloat(montoInput) <= 0}
                    className="w-full py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium"
                  >
                    {savingPago ? 'Guardando...' : 'Registrar pago'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
