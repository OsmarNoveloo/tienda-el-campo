import { AlertCircle, Eye, EyeOff, LogIn, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/apiClient'

type LoginErrors = { username?: string; password?: string }
type RecoveryErrors = { usuario?: string; email?: string; newPassword?: string; confirmPassword?: string }

function validateLogin(username: string, password: string): LoginErrors {
  const errors: LoginErrors = {}
  if (!username.trim()) errors.username = 'El usuario es obligatorio'
  if (!password) errors.password = 'La contraseña es obligatoria'
  return errors
}

function validateRecovery(
  usuario: string,
  email: string,
  newPassword: string,
  confirmPassword: string,
): RecoveryErrors {
  const errors: RecoveryErrors = {}
  if (!usuario.trim()) errors.usuario = 'El usuario es obligatorio'
  if (!email.trim()) errors.email = 'El correo es obligatorio'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Correo no válido'
  if (!newPassword) errors.newPassword = 'La contraseña es obligatoria'
  else if (newPassword.length < 6) errors.newPassword = 'Mínimo 6 caracteres'
  if (!confirmPassword) errors.confirmPassword = 'Confirma tu contraseña'
  else if (newPassword !== confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden'
  return errors
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
      <AlertCircle size={12} />
      {msg}
    </p>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loading, isAuthenticated } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginErrors, setLoginErrors] = useState<LoginErrors>({})

  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryUser, setRecoveryUser] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryErrors, setRecoveryErrors] = useState<RecoveryErrors>({})

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()
    const errors = validateLogin(username, password)
    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors)
      return
    }
    setLoginErrors({})
    try {
      await login(username.trim(), password)
      toast.success('Bienvenido')
      navigate('/dashboard', { replace: true })
    } catch {
      toast.error('Usuario o contraseña incorrectos')
    }
  }

  const submitRecovery = async (event: FormEvent) => {
    event.preventDefault()
    const errors = validateRecovery(recoveryUser, recoveryEmail, newPassword, confirmPassword)
    if (Object.keys(errors).length > 0) {
      setRecoveryErrors(errors)
      return
    }
    setRecoveryErrors({})
    setRecoveryLoading(true)
    try {
      await api.post('/auth/recovery', {
        usuario: recoveryUser.trim(),
        email: recoveryEmail.trim(),
        newPassword,
      })
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión.')
      setRecoveryOpen(false)
      setRecoveryUser('')
      setRecoveryEmail('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al restablecer contraseña')
    } finally {
      setRecoveryLoading(false)
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      hasError
        ? 'border-red-400 focus:ring-red-300'
        : 'border-gray-300 focus:ring-indigo-300'
    }`

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

        <form onSubmit={submitLogin} className="p-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setLoginErrors((prev) => ({ ...prev, username: undefined }))
              }}
              className={inputClass(Boolean(loginErrors.username))}
              placeholder="Ingresa tu usuario"
              autoComplete="username"
            />
            <FieldError msg={loginErrors.username} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setLoginErrors((prev) => ({ ...prev, password: undefined }))
                }}
                type={showPassword ? 'text' : 'password'}
                className={`${inputClass(Boolean(loginErrors.password))} pr-10`}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <FieldError msg={loginErrors.password} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            <LogIn size={16} />
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <button
            type="button"
            onClick={() => setRecoveryOpen((v) => !v)}
            className="w-full text-sm text-indigo-600 hover:text-indigo-700"
          >
            {recoveryOpen ? 'Ocultar recuperación de contraseña' : 'Olvidé mi contraseña'}
          </button>
        </form>

        {recoveryOpen && (
          <form
            onSubmit={submitRecovery}
            className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4 bg-gray-50"
            noValidate
          >
            <p className="text-xs text-gray-500">
              Ingresa usuario y correo registrado para restablecer la contraseña.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <input
                value={recoveryUser}
                onChange={(e) => {
                  setRecoveryUser(e.target.value)
                  setRecoveryErrors((prev) => ({ ...prev, usuario: undefined }))
                }}
                className={inputClass(Boolean(recoveryErrors.usuario))}
                placeholder="Usuario de la cuenta"
              />
              <FieldError msg={recoveryErrors.usuario} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
              <input
                value={recoveryEmail}
                onChange={(e) => {
                  setRecoveryEmail(e.target.value)
                  setRecoveryErrors((prev) => ({ ...prev, email: undefined }))
                }}
                type="email"
                className={inputClass(Boolean(recoveryErrors.email))}
                placeholder="Correo registrado"
              />
              <FieldError msg={recoveryErrors.email} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <div className="relative">
                <input
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setRecoveryErrors((prev) => ({ ...prev, newPassword: undefined }))
                  }}
                  type={showNewPassword ? 'text' : 'password'}
                  className={`${inputClass(Boolean(recoveryErrors.newPassword))} pr-10`}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <FieldError msg={recoveryErrors.newPassword} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
              <input
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setRecoveryErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }}
                type="password"
                className={inputClass(Boolean(recoveryErrors.confirmPassword))}
                placeholder="Repite la nueva contraseña"
              />
              <FieldError msg={recoveryErrors.confirmPassword} />
            </div>

            <button
              type="submit"
              disabled={recoveryLoading}
              className="w-full rounded-lg bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {recoveryLoading ? 'Actualizando...' : 'Restablecer contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
