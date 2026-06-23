import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ClipboardList, DollarSign, Plus, Truck, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { api } from '../../lib/apiClient'
import type { Proveedor, ProveedorPago, ProveedorPedido } from '../../types/database'

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDayIndex(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
}

function formatCurrency(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

type ProveedorRow = Proveedor & {
  pedidoHoy?: ProveedorPedido
  pagosHoy: ProveedorPago[]
  montoInput: string
  notasInput: string
}

interface Props {
  onClose: () => void
}

export default function PosPagosProveedores({ onClose }: Props) {
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoMonto, setNuevoMonto] = useState('')
  const [nuevoNotas, setNuevoNotas] = useState('')
  const [savingNuevo, setSavingNuevo] = useState(false)

  const today = new Date()
  const todayStr = toDateStr(today)
  const todayDayIdx = getDayIndex(today)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ items }, { pagos, pedidos }] = await Promise.all([
        api.get<{ items: Proveedor[]; total: number }>('/proveedores?pageSize=200'),
        api.get<{ pagos: ProveedorPago[]; pedidos: ProveedorPedido[] }>(
          `/proveedores/semana?from=${todayStr}&to=${todayStr}`,
        ),
      ])

      const hoy = items
        .filter((p) => p.activo && p.dias_visita?.includes(todayDayIdx))
        .map((p) => ({
          ...p,
          pedidoHoy: pedidos.find((d) => d.proveedor_id === p.id),
          pagosHoy: pagos.filter((pa) => pa.proveedor_id === p.id),
          montoInput: '',
          notasInput: '',
        }))

      setProveedores(hoy)
      setExpandedIds(new Set(hoy.length === 1 ? [hoy[0].id] : []))
    } catch {
      toast.error('Error cargando proveedores del día')
    } finally {
      setLoading(false)
    }
  }, [todayStr, todayDayIdx])

  useEffect(() => { void load() }, [load])

  const updateInput = (id: number, field: 'montoInput' | 'notasInput', value: string) => {
    setProveedores((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const registrarPago = async (prov: ProveedorRow) => {
    const monto = parseFloat(prov.montoInput)
    if (isNaN(monto) || monto <= 0) { toast.error('Ingresa un monto válido'); return }

    setSavingId(prov.id)
    try {
      await api.post(`/proveedores/${prov.id}/pagos`, {
        fecha: todayStr,
        monto,
        notas: prov.notasInput.trim() || null,
      })
      toast.success(`Pago registrado — ${prov.nombre}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar pago')
    } finally {
      setSavingId(null)
    }
  }

  const registrarNuevo = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) { toast.error('Ingresa el nombre del proveedor'); return }
    const monto = parseFloat(nuevoMonto)
    if (isNaN(monto) || monto <= 0) { toast.error('Ingresa un monto válido'); return }

    setSavingNuevo(true)
    try {
      const nuevo = await api.post<{ id: number }>('/proveedores', {
        nombre,
        activo: true,
        dias_visita: [],
        telefono: null,
        email: null,
        direccion: null,
      })
      await api.post(`/proveedores/${nuevo.id}/pagos`, {
        fecha: todayStr,
        monto,
        notas: nuevoNotas.trim() || null,
      })
      toast.success(`Proveedor "${nombre}" creado y pago registrado`)
      setNuevoNombre('')
      setNuevoMonto('')
      setNuevoNotas('')
      setNuevoOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setSavingNuevo(false)
    }
  }

  const fechaLarga = today.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const totalDia = proveedores.reduce(
    (s, p) => s + p.pagosHoy.reduce((sp, pa) => sp + Number(pa.monto), 0),
    0,
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-50 rounded-lg p-1.5">
              <Truck size={16} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Pagos a proveedores</h2>
              <p className="text-xs text-gray-500 capitalize">{fechaLarga}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalDia > 0 && (
              <span className="text-sm font-bold text-emerald-600">{formatCurrency(totalDia)}</span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Cargando...</div>
          ) : proveedores.length === 0 ? (
            <div className="p-10 text-center">
              <Truck className="mx-auto text-gray-200 mb-3" size={40} />
              <p className="text-sm text-gray-400">No hay proveedores programados para hoy.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {proveedores.map((prov) => {
                const totalProv = prov.pagosHoy.reduce((s, p) => s + Number(p.monto), 0)
                const isSaving = savingId === prov.id
                const canPay = !isSaving && !!prov.montoInput && parseFloat(prov.montoInput) > 0
                const isExpanded = expandedIds.has(prov.id)
                const isOnly = proveedores.length === 1

                return (
                  <div key={prov.id}>
                    {/* Header row — clickable to toggle when multiple providers */}
                    <button
                      type="button"
                      onClick={() => !isOnly && toggleExpanded(prov.id)}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left ${!isOnly ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {!isOnly && (
                          <ChevronDown
                            size={15}
                            className={`text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        )}
                        <span className="text-sm font-semibold text-gray-800 truncate">{prov.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {totalProv > 0 && (
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCurrency(totalProv)}
                          </span>
                        )}
                        {!isExpanded && prov.pagosHoy.length === 0 && (
                          <span className="text-xs text-gray-400">Sin pagos</span>
                        )}
                      </div>
                    </button>

                    {/* Expandable content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {/* Pedido del día */}
                        {prov.pedidoHoy && (
                          <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            <ClipboardList size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {prov.pedidoHoy.pedido}
                            </p>
                          </div>
                        )}

                        {/* Pagos ya registrados */}
                        {prov.pagosHoy.length > 0 && (
                          <div className="space-y-1">
                            {prov.pagosHoy.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5"
                              >
                                <span className="text-sm font-semibold text-emerald-700">
                                  {formatCurrency(Number(p.monto))}
                                </span>
                                {p.notas && <span className="text-xs text-gray-500 truncate ml-2">{p.notas}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Formulario de pago */}
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-2">
                          <p className="text-xs font-medium text-gray-500">
                            {prov.pagosHoy.length > 0 ? 'Agregar otro pago' : 'Registrar pago'}
                          </p>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                type="number"
                                value={prov.montoInput}
                                onChange={(e) => updateInput(prov.id, 'montoInput', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void registrarPago(prov) }}
                                placeholder="0.00"
                                min="0.01"
                                step="0.01"
                                className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                              />
                            </div>
                            <button
                              onClick={() => void registrarPago(prov)}
                              disabled={!canPay}
                              className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {isSaving ? '...' : 'Pagar'}
                            </button>
                          </div>
                          <input
                            value={prov.notasInput}
                            onChange={(e) => updateInput(prov.id, 'notasInput', e.target.value)}
                            placeholder="Notas opcionales"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Proveedor no registrado ── */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setNuevoOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <Plus size={15} className={`transition-transform duration-150 ${nuevoOpen ? 'rotate-45' : ''}`} />
              Proveedor no registrado
            </button>

            {nuevoOpen && (
              <div className="px-4 pb-4 space-y-2">
                <p className="text-xs text-gray-400">
                  Se creará el proveedor con estos datos. Puedes completar su perfil después en la sección Proveedores.
                </p>
                <input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre del proveedor *"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      value={nuevoMonto}
                      onChange={(e) => setNuevoMonto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void registrarNuevo() }}
                      placeholder="0.00"
                      min="0.01"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <button
                    onClick={() => void registrarNuevo()}
                    disabled={savingNuevo || !nuevoNombre.trim() || !nuevoMonto || parseFloat(nuevoMonto) <= 0}
                    className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingNuevo ? '...' : 'Guardar'}
                  </button>
                </div>
                <input
                  value={nuevoNotas}
                  onChange={(e) => setNuevoNotas(e.target.value)}
                  placeholder="Notas opcionales"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
