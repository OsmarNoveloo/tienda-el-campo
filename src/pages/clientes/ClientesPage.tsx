import { Users, Plus, Pencil, AlertCircle, ChevronDown, DollarSign, Search } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { supabase } from '../../lib/supabaseClient'
import { getLocalISOString } from '../../lib/dateUtils'
import type { Cliente, CreditoVenta, AbonoCredito } from '../../types/database'

type ClienteRow = Cliente & { total_deuda: number }

type DeudaDetalle = CreditoVenta & {
  usuario_nombre: string
  venta_folio: string
  abonos: AbonoCredito[]
}

const schema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  limite_credito: z.coerce.number().min(0, 'Límite de crédito debe ser >= 0').optional(),
  activo: z.boolean(),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

type EditingCliente = Pick<Cliente, 'id' | 'nombre' | 'telefono' | 'direccion' | 'limite_credito' | 'activo'>

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EditingCliente | null>(null)
  const [expandedClienteId, setExpandedClienteId] = useState<number | null>(null)
  const [deudasMap, setDeudasMap] = useState<Map<number, DeudaDetalle[]>>(new Map())
  const [searchTerm, setSearchTerm] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isValid } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      telefono: '',
      direccion: '',
      limite_credito: 0,
      activo: true,
    },
  })

  const loadClientes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre')
      if (err) throw err
      
      // Calcular total deuda por cliente
      const clientesConDeuda: ClienteRow[] = []
      for (const cliente of (data ?? [])) {
        const { data: creditos, error: credErr } = await supabase
          .from('creditos_ventas')
          .select('saldo_pendiente')
          .eq('cliente_id', cliente.id)
          .neq('estado', 'PAGADO')
        
        if (credErr) {
          console.error(`Error cargando créditos de cliente ${cliente.id}:`, credErr)
          clientesConDeuda.push({ ...cliente, total_deuda: 0 })
        } else {
          const total_deuda = (creditos ?? []).reduce((acc, c) => acc + Number(c.saldo_pendiente), 0)
          clientesConDeuda.push({ ...cliente, total_deuda })
        }
      }
      
      setClientes(clientesConDeuda)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando clientes'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDeudasCliente = useCallback(async (clienteId: number) => {
    try {
      const { data: creditos, error: credErr } = await supabase
        .from('creditos_ventas')
        .select('id, venta_id, cliente_id, usuario_id, fecha_credito, total_credito, saldo_pendiente, estado')
        .eq('cliente_id', clienteId)
        .neq('estado', 'PAGADO')
        .order('fecha_credito', { ascending: false })
      
      if (credErr) throw credErr
      
      const deudas: DeudaDetalle[] = []
      for (const credito of (creditos ?? [])) {
        // Cargar detalles de venta y usuario
        const [ventaRes, usuarioRes, abonasRes] = await Promise.all([
          supabase.from('ventas').select('folio').eq('id', credito.venta_id).single(),
          supabase.from('usuarios').select('nombre').eq('id', credito.usuario_id).single(),
          supabase.from('abonos_credito').select('*').eq('credito_id', credito.id).order('fecha_abono', { ascending: false })
        ])
        
        const venta_folio = ventaRes.data?.folio ?? 'N/A'
        const usuario_nombre = usuarioRes.data?.nombre ?? 'Sin usuario'
        const abonos = (abonasRes.data ?? []) as AbonoCredito[]
        
        deudas.push({
          ...credito,
          usuario_nombre,
          venta_folio,
          abonos,
        })
      }
      
      const newMap = new Map(deudasMap)
      newMap.set(clienteId, deudas)
      setDeudasMap(newMap)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando deudas'
      toast.error(msg)
    }
  }, [deudasMap])

  const toggleExpand = (clienteId: number) => {
    if (expandedClienteId === clienteId) {
      setExpandedClienteId(null)
    } else {
      setExpandedClienteId(clienteId)
      if (!deudasMap.has(clienteId)) {
        void loadDeudasCliente(clienteId)
      }
    }
  }

  useEffect(() => {
    loadClientes()
  }, [loadClientes])

  const filteredClientes = useMemo(() => {
    if (!searchTerm) return clientes
    const term = searchTerm.toLowerCase()
    return clientes.filter(c => 
      c.nombre.toLowerCase().includes(term) ||
      c.telefono?.toLowerCase().includes(term)
    )
  }, [clientes, searchTerm])

  const openCreate = () => {
    setEditing(null)
    reset({
      nombre: '',
      telefono: '',
      direccion: '',
      limite_credito: 0,
      activo: true,
    })
    setModalOpen(true)
  }

  const openEdit = (cliente: EditingCliente) => {
    setEditing(cliente)
    reset({
      nombre: cliente.nombre,
      telefono: cliente.telefono ?? '',
      direccion: cliente.direccion ?? '',
      limite_credito: cliente.limite_credito ?? 0,
      activo: cliente.activo ?? true,
    })
    setModalOpen(true)
  }

  const submitForm = async (values: FormOutput) => {
    try {
      if (editing) {
        const { error } = await supabase
          .from('clientes')
          .update({
            nombre: values.nombre,
            telefono: values.telefono || null,
            direccion: values.direccion || null,
            limite_credito: values.limite_credito || null,
            activo: values.activo,
          })
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Cliente actualizado')
      } else {
        const { error } = await supabase.from('clientes').insert([
          {
            nombre: values.nombre,
            telefono: values.telefono || null,
            direccion: values.direccion || null,
            limite_credito: values.limite_credito || null,
            activo: values.activo,
            creado_en: getLocalISOString(),
          },
        ])
        if (error) throw error
        toast.success('Cliente creado')
      }
      setModalOpen(false)
      await loadClientes()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar'
      toast.error(msg)
    }
  }

  const toggleEstado = async (cliente: ClienteRow) => {
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ activo: !cliente.activo })
        .eq('id', cliente.id)
      if (error) throw error
      toast.success(`Cliente ${!cliente.activo ? 'activado' : 'desactivado'}`)
      await loadClientes()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar estado'
      toast.error(msg)
    }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Users className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Nuevo cliente
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-3 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Cargando clientes...
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-400 text-sm">No hay clientes registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-265 text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 w-8"></th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Teléfono</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Dirección</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Límite crédito</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Total adeudado</th>
                <th className="text-center px-5 py-3 font-semibold text-gray-600">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredClientes.map((cliente) => {
                const deudas = deudasMap.get(cliente.id) ?? []
                const isExpanded = expandedClienteId === cliente.id
                return (
                  <Fragment key={cliente.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        {cliente.total_deuda > 0 && (
                          <button
                            onClick={() => toggleExpand(cliente.id)}
                            className="p-1 text-gray-400 hover:text-indigo-600"
                            title="Ver deudas"
                          >
                            <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800">{cliente.nombre}</td>
                      <td className="px-5 py-3 text-gray-500">{cliente.telefono ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500 truncate max-w-xs">{cliente.direccion ?? '—'}</td>
                      <td className="px-5 py-3 text-right text-gray-700">${Number(cliente.limite_credito ?? 0).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{cliente.total_deuda > 0 ? <span className="text-red-600">${Number(cliente.total_deuda).toFixed(2)}</span> : <span className="text-gray-400">$0.00</span>}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cliente.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {cliente.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit({ id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, direccion: cliente.direccion, limite_credito: cliente.limite_credito, activo: cliente.activo ?? true })}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => toggleEstado(cliente)}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title={cliente.activo ? 'Desactivar' : 'Activar'}
                          >
                            <AlertCircle size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && deudas.length > 0 && (
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="space-y-3">
                            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                              <DollarSign size={16} />
                              Deudas activas ({deudas.length})
                            </h4>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {deudas.map((deuda) => (
                                <div key={deuda.id} className="bg-white rounded-lg border border-gray-200 p-3 text-xs space-y-1">
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-800">Venta: {deuda.venta_folio}</span>
                                    <span className="text-gray-600">{new Date(deuda.fecha_credito).toLocaleDateString('es-MX')}</span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Total crédito:</span>
                                    <span>${Number(deuda.total_credito).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Saldo pendiente:</span>
                                    <span className="font-semibold text-red-600">${Number(deuda.saldo_pendiente).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Estado:</span>
                                    <span className="font-medium">{deuda.estado}</span>
                                  </div>
                                  {deuda.abonos.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-200">
                                      <p className="font-semibold text-gray-700 mb-1">Abonos:</p>
                                      {deuda.abonos.map((abono) => (
                                        <div key={abono.id} className="flex justify-between text-gray-600">
                                          <span>{new Date(abono.fecha_abono).toLocaleDateString('es-MX')}</span>
                                          <span>-${Number(abono.monto).toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
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
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <form onSubmit={handleSubmit(submitForm)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                <input
                  {...register('nombre')}
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                {errors.nombre && <p className="text-xs text-red-600 mt-1">{errors.nombre.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
                <input
                  {...register('telefono')}
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Dirección</label>
                <input
                  {...register('direccion')}
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Límite de crédito</label>
                <input
                  {...register('limite_credito')}
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  {...register('activo')}
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                />
                <label className="text-xs text-gray-600">Activo</label>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
