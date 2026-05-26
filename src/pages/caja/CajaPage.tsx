import { useCallback, useEffect, useState } from 'react'
import { Banknote, Plus, Lock, AlertCircle, CheckCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { useCaja } from '../../hooks/useCaja'
import type { Usuario } from '../../types/database'

const abrirSchema = z.object({
  empleado_apertura_id: z.coerce.number().positive('Selecciona un usuario'),
  monto_apertura: z.coerce.number().nonnegative('Monto inicial no puede ser negativo'),
})

const cerrarSchema = z.object({
  total_efectivo: z.coerce.number().nonnegative('Total efectivo no puede ser negativo'),
  total_tarjeta: z.coerce.number().nonnegative('Total tarjeta no puede ser negativo'),
  observacion: z.string().optional(),
})

type AbrirInput = z.input<typeof abrirSchema>
type AbrirOutput = z.output<typeof abrirSchema>
type CerrarInput = z.input<typeof cerrarSchema>
type CerrarOutput = z.output<typeof cerrarSchema>

export default function CajaPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'actual' | 'historial'>('actual')
  const [modalAbrirOpen, setModalAbrirOpen] = useState(false)
  const [modalCerrarOpen, setModalCerrarOpen] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const { cajaActual, cortes, loading, error, abrirCaja, cerrarCaja, refetch } = useCaja()

  const {
    register: registerAbrir,
    handleSubmit: handleSubmitAbrir,
    reset: resetAbrir,
    formState: { errors: errorsAbrir, isSubmitting: isSubmittingAbrir },
  } = useForm<AbrirInput, unknown, AbrirOutput>({
    resolver: zodResolver(abrirSchema),
    defaultValues: { empleado_apertura_id: 0, monto_apertura: 0 },
  })

  const {
    register: registerCerrar,
    handleSubmit: handleSubmitCerrar,
    reset: resetCerrar,
    formState: { errors: errorsCerrar, isSubmitting: isSubmittingCerrar },
  } = useForm<CerrarInput, unknown, CerrarOutput>({
    resolver: zodResolver(cerrarSchema),
    defaultValues: { total_efectivo: 0, total_tarjeta: 0, observacion: '' },
  })

  const loadUsuarios = useCallback(async () => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('estado', 'ACTIVO')
      .order('nombre')

    if (error) {
      toast.error(error.message)
      return
    }
    setUsuarios((data ?? []) as Usuario[])
  }, [])

  useEffect(() => {
    loadUsuarios()
  }, [loadUsuarios])

  useEffect(() => {
    if (tab === 'historial') {
      void refetch()
    }
  }, [tab, refetch])

  const submitAbrir = async (values: AbrirOutput) => {
    try {
      await abrirCaja({
        empleado_apertura_id: values.empleado_apertura_id,
        monto_apertura: values.monto_apertura,
      })
      toast.success('Caja abierta exitosamente')
      setModalAbrirOpen(false)
      resetAbrir()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al abrir caja')
    }
  }

  const submitCerrar = async (values: CerrarOutput) => {
    if (!cajaActual) {
      toast.error('No hay caja abierta')
      return
    }

    try {
      if (!user) {
        toast.error('No hay sesión activa')
        return
      }

      await cerrarCaja(cajaActual.id, {
        empleado_cierre_id: user.id,
        total_efectivo: values.total_efectivo,
        total_tarjeta: values.total_tarjeta,
        observaciones: values.observacion,
      })
      toast.success('Caja cerrada')
      setModalCerrarOpen(false)
      resetCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cerrar caja')
    }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Banknote className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Caja</h1>
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          {!cajaActual ? (
            <button
              onClick={() => setModalAbrirOpen(true)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
            >
              <Plus size={16} /> Abrir caja
            </button>
          ) : (
            <button
              onClick={() => setModalCerrarOpen(true)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              <Lock size={16} /> Cerrar caja
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {cajaActual && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-600 uppercase">Monto apertura</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">
              ${Number(cajaActual.monto_apertura).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-600 uppercase">Abierta por</p>
            <p className="text-lg font-semibold text-gray-800 mt-1">{cajaActual.usuario_nombre}</p>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(cajaActual.fecha_apertura).toLocaleString('es-ES')}
            </p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="text-emerald-600" size={18} />
              <div>
                <p className="text-xs font-medium text-emerald-600 uppercase">Estado</p>
                <p className="text-lg font-semibold text-emerald-700 mt-0.5">Abierta</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!cajaActual && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-semibold text-amber-900 text-sm">No hay caja abierta</p>
              <p className="text-amber-800 text-xs mt-1">Abre una caja para iniciar operaciones</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setTab('actual')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            tab === 'actual'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Caja Actual
        </button>
        <button
          onClick={() => setTab('historial')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            tab === 'historial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Historial de Cortes
        </button>
      </div>

      {tab === 'actual' && cajaActual && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-800 text-sm">Información de la caja</h3>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">ID de sesión:</span>
              <span className="font-medium text-gray-800">#{cajaActual.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Usuario:</span>
              <span className="font-medium text-gray-800">{cajaActual.usuario_nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Apertura:</span>
              <span className="font-medium text-gray-800">
                {new Date(cajaActual.fecha_apertura).toLocaleString('es-ES')}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Monto apertura:</span>
              <span className="font-bold text-gray-800">
                ${Number(cajaActual.monto_apertura).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'actual' && !cajaActual && (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <Banknote className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="text-gray-400 text-sm">No hay caja abierta actualmente</p>
        </div>
      )}

      {tab === 'historial' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Cargando historial...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Usuario</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Ventas</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Efectivo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Tarjeta</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cortes.map((corte) => (
                  <tr key={corte.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 font-medium">#{corte.id}</td>
                    <td className="px-4 py-3 text-gray-600">{corte.usuario_nombre}</td>
                    <td className="px-4 py-3 text-right font-medium">${Number(corte.total_ventas).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                      ${Number(corte.total_efectivo).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-600 font-medium">
                      ${Number(corte.total_tarjeta).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{new Date(corte.fecha_corte).toLocaleString('es-ES')}</td>
                  </tr>
                ))}
                {!cortes.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No hay cortes registrados.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalAbrirOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Abrir caja</h2>
            </div>

            <form onSubmit={handleSubmitAbrir(submitAbrir)} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <select
                  {...registerAbrir('empleado_apertura_id')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value={0}>Selecciona un usuario</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
                {errorsAbrir.empleado_apertura_id && (
                  <p className="text-xs text-red-500 mt-1">{errorsAbrir.empleado_apertura_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto inicial ($)</label>
                <input
                  {...registerAbrir('monto_apertura')}
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {errorsAbrir.monto_apertura && (
                  <p className="text-xs text-red-500 mt-1">{errorsAbrir.monto_apertura.message}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbrirOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAbrir}
                  className="px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSubmittingAbrir ? 'Abriendo...' : 'Abrir caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalCerrarOpen && cajaActual && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Cerrar caja y hacer corte</h2>
            </div>

            <form onSubmit={handleSubmitCerrar(submitCerrar)} className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <p className="font-medium">Información de la caja:</p>
                <p className="mt-1">
                  Monto apertura: <span className="font-semibold">${Number(cajaActual.monto_apertura).toFixed(2)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total efectivo ($)</label>
                <input
                  {...registerCerrar('total_efectivo')}
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {errorsCerrar.total_efectivo && (
                  <p className="text-xs text-red-500 mt-1">{errorsCerrar.total_efectivo.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total tarjeta ($)</label>
                <input
                  {...registerCerrar('total_tarjeta')}
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {errorsCerrar.total_tarjeta && (
                  <p className="text-xs text-red-500 mt-1">{errorsCerrar.total_tarjeta.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observación</label>
                <textarea
                  {...registerCerrar('observacion')}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCerrarOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCerrar}
                  className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {isSubmittingCerrar ? 'Cerrando...' : 'Cerrar caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
