import { useCallback, useDeferredValue, useEffect, useState } from 'react'
import { Truck, Plus, Pencil, UserCheck, UserX, Search, X, AlertCircle, ChevronLeft, ChevronRight, CalendarDays, List } from 'lucide-react'
import { toast } from 'react-toastify'
import { supabase } from '../../lib/supabaseClient'
import { getLocalISOString } from '../../lib/dateUtils'
import type { Proveedor } from '../../types/database'
import ProveedoresSemana from './ProveedoresSemana'

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type FormState = {
  nombre: string
  telefono: string
  email: string
  direccion: string
  dias_visita: number[]
}

const initialForm: FormState = {
  nombre: '',
  telefono: '',
  email: '',
  direccion: '',
  dias_visita: [],
}

type Tab = 'lista' | 'semana'

export default function ProveedoresPage() {
  const PAGE_SIZE_OPTIONS = [20, 50, 100]
  const [activeTab, setActiveTab] = useState<Tab>('lista')
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<FormState>(initialForm)

  const loadProveedores = useCallback(async () => {
    setLoading(true)
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('proveedores')
      .select('*', { count: 'exact' })

    const term = deferredSearch.trim()
    if (term) {
      query = query.or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%,email.ilike.%${term}%`)
    }

    const { data, error, count } = await query
      .order('activo', { ascending: false })
      .order('nombre', { ascending: true })
      .range(from, to)

    if (error) {
      toast.error(`Error cargando proveedores: ${error.message}`)
      setProveedores([])
      setTotalCount(0)
      setLoading(false)
      return
    }

    setProveedores((data ?? []) as Proveedor[])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [currentPage, deferredSearch, pageSize])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  const proveedoresFiltrados = proveedores

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const abrirCrear = () => {
    setEditing(null)
    setForm(initialForm)
    setModalOpen(true)
  }

  const abrirEditar = (proveedor: Proveedor) => {
    setEditing(proveedor)
    setForm({
      nombre: proveedor.nombre,
      telefono: proveedor.telefono ?? '',
      email: proveedor.email ?? '',
      direccion: proveedor.direccion ?? '',
      dias_visita: proveedor.dias_visita ?? [],
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
    setForm(initialForm)
  }

  const toggleDia = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      dias_visita: prev.dias_visita.includes(idx)
        ? prev.dias_visita.filter((d) => d !== idx)
        : [...prev.dias_visita, idx].sort((a, b) => a - b),
    }))
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const nombre = form.nombre.trim()
    if (nombre.length < 2) {
      toast.error('El nombre del proveedor es requerido')
      return
    }

    setSaving(true)

    const payload = {
      nombre,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      dias_visita: form.dias_visita,
    }

    if (editing) {
      const { error, count } = await supabase
        .from('proveedores')
        .update(payload, { count: 'exact' })
        .eq('id', editing.id)

      if (error) {
        toast.error(error.message)
        setSaving(false)
        return
      }

      if (count === 0) {
        toast.error('No se encontró el proveedor para actualizar')
        setSaving(false)
        return
      }

      toast.success('Proveedor actualizado')
      setSaving(false)
      closeModal()
      await loadProveedores()
      return
    }

    const { error } = await supabase.from('proveedores').insert([
      {
        ...payload,
        activo: true,
        creado_en: getLocalISOString(),
      },
    ])

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success('Proveedor creado')
    setSaving(false)
    closeModal()
    await loadProveedores()
  }

  const canSubmitProveedor = form.nombre.trim().length >= 2

  const toggleEstado = async (proveedor: Proveedor) => {
    const next = !proveedor.activo
    const { error } = await supabase
      .from('proveedores')
      .update({ activo: next })
      .eq('id', proveedor.id)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(next ? 'Proveedor activado' : 'Proveedor desactivado')
    await loadProveedores()
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Truck className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Proveedores</h1>
        </div>
        <button
          onClick={abrirCrear}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          <Plus size={16} />
          Nuevo proveedor
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('lista')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
            activeTab === 'lista'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <List size={15} />
          Lista
        </button>
        <button
          onClick={() => setActiveTab('semana')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
            activeTab === 'semana'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays size={15} />
          Semana
        </button>
      </div>

      {activeTab === 'semana' ? (
        <ProveedoresSemana proveedores={proveedores} />
      ) : (
        <>
          {/* Buscador */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Buscar por nombre, teléfono o email"
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-gray-400">Cargando proveedores...</div>
            ) : proveedoresFiltrados.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400">No hay proveedores registrados.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-195 text-sm">
                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Nombre</th>
                        <th className="text-left px-5 py-3 font-semibold">Días</th>
                        <th className="text-left px-5 py-3 font-semibold">Teléfono</th>
                        <th className="text-left px-5 py-3 font-semibold">Email</th>
                        <th className="text-left px-5 py-3 font-semibold">Dirección</th>
                        <th className="text-center px-5 py-3 font-semibold">Estado</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {proveedoresFiltrados.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{p.nombre}</td>
                          <td className="px-5 py-3">
                            {p.dias_visita && p.dias_visita.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {p.dias_visita.map((d) => (
                                  <span
                                    key={d}
                                    className="inline-flex px-1.5 py-0.5 rounded text-xs bg-indigo-50 text-indigo-600 font-medium"
                                  >
                                    {DIAS_SEMANA[d]}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-600">{p.telefono ?? '—'}</td>
                          <td className="px-5 py-3 text-gray-600">{p.email ?? '—'}</td>
                          <td className="px-5 py-3 text-gray-600 max-w-72 truncate">{p.direccion ?? '—'}</td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                p.activo
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {p.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => abrirEditar(p)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title="Editar"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => toggleEstado(p)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                                title={p.activo ? 'Desactivar' : 'Activar'}
                              >
                                {p.activo ? (
                                  <UserX size={15} className="text-amber-600" />
                                ) : (
                                  <UserCheck size={15} className="text-emerald-600" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
                  <p>
                    Pagina {currentPage} de {totalPages} · {totalCount} proveedores
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setCurrentPage(1)
                      }}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                      aria-label="Proveedores por página"
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}/pag
                        </option>
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
                    <span className="px-2 py-1 text-xs rounded-md bg-gray-50 border border-gray-200">
                      {currentPage}/{totalPages}
                    </span>
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
        </>
      )}

      {/* Modal crear / editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl border border-gray-100 shadow-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-indigo-600" />
                <h2 className="text-base font-semibold text-gray-800">
                  {editing ? 'Editar proveedor' : 'Nuevo proveedor'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ej. Distribuidora Centro"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
                  <input
                    value={form.telefono}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ej. 5551234567"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="proveedor@correo.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Dirección</label>
                <textarea
                  value={form.direccion}
                  onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Dirección completa"
                />
              </div>

              {/* Días de visita */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Días de visita
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((dia, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDia(i)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        form.dias_visita.includes(i)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {dia}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p>
                  Los proveedores inactivos no se eliminan del histórico y pueden reactivarse después.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                  disabled={saving || !canSubmitProveedor}
                >
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
