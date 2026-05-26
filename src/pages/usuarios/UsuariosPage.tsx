import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLocalISOString } from '../../lib/dateUtils'
import { ShieldUser, Plus, Pencil, UserCheck, UserX, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-toastify'
import { sha256Hex } from '../../lib/security'
import { supabase } from '../../lib/supabaseClient'

type RolOption = {
  id: number
  nombre: string
}

type UsuarioRow = {
  id: number
  rol_id: number
  nombre: string
  usuario: string
  telefono: string | null
  email: string | null
  estado: 'ACTIVO' | 'INACTIVO'
  creado_en: string
  rol_nombre: string
}

const schema = z.object({
  rol_id: z.coerce.number().int().positive('Selecciona un rol'),
  nombre: z.string().min(2, 'Nombre requerido'),
  usuario: z.string().min(3, 'Usuario requerido'),
  password: z.string().min(6, 'Minimo 6 caracteres').optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email invalido').or(z.literal('')).optional(),
  estado: z.enum(['ACTIVO', 'INACTIVO']),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

type EditingUser = Pick<UsuarioRow, 'id' | 'rol_id' | 'nombre' | 'usuario' | 'telefono' | 'email' | 'estado'>

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])
  const [roles, setRoles] = useState<RolOption[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EditingUser | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      rol_id: 0,
      nombre: '',
      usuario: '',
      password: '',
      telefono: '',
      email: '',
      estado: 'ACTIVO',
    },
  })

  const sortedUsuarios = useMemo(
    () => [...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [usuarios],
  )

  const loadRoles = useCallback(async () => {
    setRolesLoading(true)
    setRolesError(null)
    const { data, error } = await supabase.from('roles').select('id,nombre').order('nombre')
    if (error) {
      setRolesError(error.message)
      toast.error(`Error cargando roles: ${error.message}`)
      setRoles([])
      setRolesLoading(false)
      return
    }
    setRoles((data ?? []) as RolOption[])
    if (!data?.length) {
      setRolesError('No hay roles visibles para este usuario. Revisa politicas RLS de la tabla roles.')
    }
    setRolesLoading(false)
  }, [])

  const loadUsuarios = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('usuarios')
      .select('id,rol_id,nombre,usuario,telefono,email,estado,creado_en,roles(nombre)')
      .order('creado_en', { ascending: false })

    if (error) {
      toast.error(`Error cargando usuarios: ${error.message}`)
      setLoading(false)
      return
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      rol_id: row.rol_id,
      nombre: row.nombre,
      usuario: row.usuario,
      telefono: row.telefono,
      email: row.email,
      estado: row.estado,
      creado_en: row.creado_en,
      rol_nombre: row.roles?.nombre ?? 'Sin rol',
    }))

    setUsuarios(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadRoles()
    loadUsuarios()
  }, [loadRoles, loadUsuarios])

  const openCreate = () => {
    if (!roles.length) {
      void loadRoles()
    }
    setEditing(null)
    reset({
      rol_id: roles[0]?.id ?? 0,
      nombre: '',
      usuario: '',
      password: '',
      telefono: '',
      email: '',
      estado: 'ACTIVO',
    })
    setModalOpen(true)
  }

  const openEdit = (user: EditingUser) => {
    setEditing(user)
    reset({
      rol_id: user.rol_id,
      nombre: user.nombre,
      usuario: user.usuario,
      password: '',
      telefono: user.telefono ?? '',
      email: user.email ?? '',
      estado: user.estado,
    })
    setModalOpen(true)
  }

  const submitForm = async (values: FormOutput) => {
    if (editing) {
      const updatePayload: Record<string, unknown> = {
        rol_id: values.rol_id,
        nombre: values.nombre,
        usuario: values.usuario,
        telefono: values.telefono || null,
        email: values.email || null,
        estado: values.estado,
      }

      if (values.password && values.password.trim()) {
        updatePayload.password_hash = await sha256Hex(values.password)
      }

      const { error } = await supabase.from('usuarios').update(updatePayload).eq('id', editing.id)
      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Usuario actualizado')
      setModalOpen(false)
      setEditing(null)
      await loadUsuarios()
      return
    }

    if (!values.password || values.password.trim().length < 6) {
      toast.error('La contrasena es requerida para crear usuario')
      return
    }

    const password_hash = await sha256Hex(values.password)
    const { error } = await supabase.from('usuarios').insert([
      {
        rol_id: values.rol_id,
        nombre: values.nombre,
        usuario: values.usuario,
        password_hash,
        telefono: values.telefono || null,
        email: values.email || null,
        estado: values.estado,
        creado_en: getLocalISOString(),
      },
    ])

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Usuario creado')
    setModalOpen(false)
    await loadUsuarios()
  }

  const toggleEstado = async (user: UsuarioRow) => {
    const next = user.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
    const { error } = await supabase.from('usuarios').update({ estado: next }).eq('id', user.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`Usuario ${next.toLowerCase()}`)
    await loadUsuarios()
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldUser className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Panel de Usuarios</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Cargando usuarios...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-195 text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold">Usuario</th>
                <th className="text-left px-4 py-3 font-semibold">Rol</th>
                <th className="text-left px-4 py-3 font-semibold">Telefono</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
                <th className="text-right px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedUsuarios.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 font-medium">{user.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{user.usuario}</td>
                  <td className="px-4 py-3 text-gray-600">{user.rol_nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{user.telefono ?? 'N/A'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.estado === 'ACTIVO' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleEstado(user)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                        title="Activar/Inactivar"
                      >
                        {user.estado === 'ACTIVO' ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!sortedUsuarios.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-400" colSpan={6}>No hay usuarios registrados.</td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-xl overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit(submitForm)} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700 block mb-1">Nombre</label>
                <input {...register('nombre')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre.message}</p>}
              </div>

              <div>
                <label className="text-sm text-gray-700 block mb-1">Usuario</label>
                <input {...register('usuario')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {errors.usuario && <p className="text-xs text-red-500 mt-1">{errors.usuario.message}</p>}
              </div>

              <div>
                <label className="text-sm text-gray-700 block mb-1">
                  {editing ? 'Contrasena nueva (opcional)' : 'Contrasena'}
                </label>
                <input type="password" {...register('password')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
              </div>

              <div>
                <label className="text-sm text-gray-700 block mb-1">Rol</label>
                <select
                  {...register('rol_id')}
                  disabled={rolesLoading || roles.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value={0}>Selecciona un rol</option>
                  {roles.map((rol) => (
                    <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                  ))}
                </select>
                {errors.rol_id && <p className="text-xs text-red-500 mt-1">{errors.rol_id.message}</p>}
                {rolesLoading && <p className="text-xs text-gray-500 mt-1">Cargando roles...</p>}
                {rolesError && <p className="text-xs text-amber-600 mt-1">{rolesError}</p>}
                {!rolesLoading && !rolesError && roles.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No se encontraron roles.</p>
                )}
                <button
                  type="button"
                  onClick={() => void loadRoles()}
                  className="text-xs text-indigo-600 hover:text-indigo-700 mt-1"
                >
                  Recargar roles
                </button>
              </div>

              <div>
                <label className="text-sm text-gray-700 block mb-1">Telefono</label>
                <input {...register('telefono')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-sm text-gray-700 block mb-1">Email</label>
                <input {...register('email')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-gray-700 block mb-1">Estado</label>
                <select {...register('estado')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSubmitting ? 'Guardando...' : editing ? 'Actualizar' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
