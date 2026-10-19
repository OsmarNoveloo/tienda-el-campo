import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/apiClient'
import { ESTADOS_FALLO, getMotivoFallo, type TerminalOrder } from '../../lib/terminalPago'

export type AbonoTerminal = { credito_id: number } | { cliente_id: number }

interface Props {
  monto: number
  descripcion: string
  abono: AbonoTerminal
  // Solo recarga la información; el abono lo registra el backend al aprobarse el cobro
  onAplicado: () => Promise<void>
  onClose: () => void
}

const POLL_MS = 3000

export default function CreditoCobroTerminal({ monto, descripcion, abono, onAplicado, onClose }: Props) {
  const [status, setStatus] = useState('iniciando')
  const [errorMsg, setErrorMsg] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [intento, setIntento] = useState(0)
  const orderIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Evita que dos consultas traslapadas procesen el mismo resultado
  const consultandoRef = useRef(false)

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  // Regresa true cuando la orden llegó a un estado final
  const procesarOrden = async (data: TerminalOrder): Promise<boolean> => {
    if (data.status === 'processed') {
      if (data.aplicacion?.ok) {
        setStatus('aplicado')
        await onAplicado().catch(() => undefined)
        setTimeout(onClose, 1200)
      } else {
        setStatus('error-aplicar')
        setErrorMsg(data.aplicacion?.error ?? 'No se pudo confirmar el registro del abono')
      }
      return true
    }
    if (ESTADOS_FALLO.includes(data.status)) {
      setErrorMsg(getMotivoFallo(data, data.status))
      setStatus(data.status)
      return true
    }
    setStatus(data.status)
    return false
  }

  useEffect(() => {
    let cancelado = false

    const iniciar = async () => {
      try {
        const order = await api.post<TerminalOrder>('/mercadopago/pago', { monto, descripcion, abono })
        if (cancelado) return
        orderIdRef.current = order.id
        setStatus(order.status ?? 'created')

        pollTimerRef.current = setInterval(async () => {
          if (!orderIdRef.current || consultandoRef.current) return
          consultandoRef.current = true
          try {
            const data = await api.get<TerminalOrder>(`/mercadopago/pago/${orderIdRef.current}`)
            if (cancelado) return
            if (await procesarOrden(data)) stopPolling()
          } catch {
            // sigue intentando en el próximo ciclo
          } finally {
            consultandoRef.current = false
          }
        }, POLL_MS)
      } catch (err) {
        if (cancelado) return
        setStatus('error')
        setErrorMsg((err as Error).message ?? 'No se pudo iniciar el cobro en la terminal')
      }
    }

    void iniciar()

    return () => {
      cancelado = true
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monto, descripcion, intento])

  const handleCancelar = async () => {
    setCancelando(true)
    stopPolling()
    try {
      if (orderIdRef.current) {
        await api.delete(`/mercadopago/pago/${orderIdRef.current}`)
      }
    } catch {
      // si ya está en la terminal, Mercado Pago rechaza el cancel por API; se resuelve desde el dispositivo
    }
    onClose()
  }

  const handleReintentar = () => {
    orderIdRef.current = null
    setErrorMsg('')
    setStatus('iniciando')
    setIntento((n) => n + 1)
  }

  // El cobro ya se hizo: se vuelve a consultar la misma orden para que el backend reintente
  // registrar el abono. Nunca se cobra de nuevo ni se duplica el abono.
  const handleVerificarAbono = async () => {
    if (!orderIdRef.current) return
    setVerificando(true)
    try {
      const data = await api.get<TerminalOrder>(`/mercadopago/pago/${orderIdRef.current}`)
      await procesarOrden(data)
    } catch (err) {
      setErrorMsg((err as Error).message ?? 'No se pudo consultar el cobro')
    } finally {
      setVerificando(false)
    }
  }

  const fallo = status === 'error' || ESTADOS_FALLO.includes(status)
  // Cualquier estado no reconocido se muestra como "esperando" para que el modal nunca quede en blanco
  const esperando = !fallo && !['aplicado', 'error-aplicar'].includes(status)

  return (
    <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 text-center">
        {esperando && (
          <>
            <Loader2 className="mx-auto text-indigo-600 animate-spin" size={40} />
            <h3 className="mt-3 text-base font-semibold text-gray-800">Esperando la tarjeta...</h3>
            <p className="mt-1 text-sm text-gray-500">
              {status === 'at_terminal'
                ? 'Pide al cliente que pase o acerque su tarjeta en la terminal.'
                : 'Enviando el cobro a la terminal...'}
            </p>
            <p className="mt-3 text-2xl font-extrabold text-gray-900">${monto.toFixed(2)}</p>
            <button
              type="button"
              onClick={() => void handleCancelar()}
              disabled={cancelando}
              className="mt-5 w-full py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelando ? 'Cancelando...' : 'Cancelar cobro'}
            </button>
          </>
        )}

        {status === 'aplicado' && (
          <>
            <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
            <h3 className="mt-3 text-base font-semibold text-gray-800">Abono registrado</h3>
            <p className="mt-1 text-sm text-gray-500">${monto.toFixed(2)} cobrados con tarjeta.</p>
          </>
        )}

        {status === 'error-aplicar' && (
          <>
            <AlertTriangle className="mx-auto text-amber-500" size={40} />
            <h3 className="mt-3 text-base font-semibold text-gray-800">El cobro sí se realizó</h3>
            <p className="mt-1 text-sm text-gray-500">
              Pero no se pudo registrar el abono: {errorMsg}. Verifica de nuevo; no se vuelve a cobrar ni se duplica el abono.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => void handleVerificarAbono()}
                disabled={verificando}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {verificando ? 'Verificando...' : 'Verificar de nuevo'}
              </button>
            </div>
          </>
        )}

        {fallo && (
          <>
            <XCircle className="mx-auto text-red-600" size={40} />
            <h3 className="mt-3 text-base font-semibold text-gray-800">
              {status === 'error' ? 'No se pudo iniciar el cobro' : 'El cobro no se completó'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">{errorMsg}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleReintentar}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Reintentar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
