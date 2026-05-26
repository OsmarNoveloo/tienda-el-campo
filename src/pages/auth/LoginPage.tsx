import { LogIn, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { sha256Hex } from '../../lib/security'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loading, isAuthenticated } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryUser, setRecoveryUser] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()

    try {
      await login(username.trim(), password)
      toast.success('Bienvenido')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo iniciar sesion')
    }
  }

  const submitRecovery = async (event: FormEvent) => {
    event.preventDefault()

    if (newPassword.trim().length < 6) {
      toast.error('La nueva contrasena debe tener al menos 6 caracteres')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contrasenas no coinciden')
      return
    }

    setRecoveryLoading(true)

    const { data, error } = await supabase
      .from('usuarios')
      .select('id')
      .eq('usuario', recoveryUser.trim())
      .eq('email', recoveryEmail.trim())
      .eq('estado', 'ACTIVO')
      .maybeSingle()

    if (error) {
      setRecoveryLoading(false)
      toast.error(error.message)
      return
    }

    if (!data) {
      setRecoveryLoading(false)
      toast.error('No se encontro un usuario activo con esos datos')
      return
    }

    const password_hash = await sha256Hex(newPassword)

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ password_hash })
      .eq('id', data.id)

    setRecoveryLoading(false)

    if (updateError) {
      toast.error(updateError.message)
      return
    }

    toast.success('Contrasena actualizada. Ya puedes iniciar sesion.')
    setRecoveryOpen(false)
    setRecoveryUser('')
    setRecoveryEmail('')
    setNewPassword('')
    setConfirmPassword('')
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 rounded-lg p-2">
              <Store className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Ingreso al sistema</h1>
              <p className="text-xs text-gray-500">Tienda el Campo</p>
            </div>
          </div>
        </div>

        <form onSubmit={submitLogin} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Ingresa tu usuario"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contrasena</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Ingresa tu contrasena"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            <LogIn size={16} />
            {loading ? 'Ingresando...' : 'Iniciar sesion'}
          </button>

          <button
            type="button"
            onClick={() => setRecoveryOpen((current) => !current)}
            className="w-full text-sm text-indigo-600 hover:text-indigo-700"
          >
            {recoveryOpen ? 'Ocultar recuperación de contraseña' : 'Olvidé mi contraseña'}
          </button>
        </form>

        {recoveryOpen && (
          <form onSubmit={submitRecovery} className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4 bg-gray-50">
            <p className="text-xs text-gray-500">
              Ingresa usuario y correo registrado para restablecer la contraseña.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <input
                value={recoveryUser}
                onChange={(event) => setRecoveryUser(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Usuario de la cuenta"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
              <input
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Correo registrado"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contrasena</label>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Minimo 6 caracteres"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contrasena</label>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Repite la nueva contrasena"
                required
              />
            </div>

            <button
              type="submit"
              disabled={recoveryLoading}
              className="w-full rounded-lg bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {recoveryLoading ? 'Actualizando...' : 'Restablecer contrasena'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
