import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'react-toastify'
import { api } from '../../lib/apiClient'

interface TerminalOrder {
  id: string
  status: string
}

interface Props {
  ventaId: number
  monto: number
  folio: string
  onSuccess: () => void
  onClose: () => void
}

const POLL_MS = 3000
const ESTADOS_ESPERA = ['iniciando', 'created', 'at_terminal']
const ESTADOS_FALLO = ['canceled', 'expired', 'rejected']

export default function PosCobroTerminal({ ventaId, monto, folio, onSuccess, onClose }: Props) {
  const [status, setStatus] = useState('iniciando')
  const [errorMsg, setErrorMsg] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const orderIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const cancelarVentaPendiente = async () => {
    try {
      await api.patch(`/ventas/${ventaId}/cancelar`)
    } catch {
      // si falla, la venta queda pendiente para revisión manual
    }
  }

  useEffect(() => {
    let cancelado = false

    const iniciar = async () => {
      try {
        const order = await api.post<TerminalOrder>('/mercadopago/pago', {
          venta_id: ventaId,
          monto,
          descripcion: folio,
        })
        if (cancelado) return
        orderIdRef.current = order.id
        setStatus(order.status ?? 'created')

        pollTimerRef.current = setInterval(async () => {
          if (!orderIdRef.current) return
          try {
            const data = await api.get<TerminalOrder>(`/mercadopago/pago/${orderIdRef.current}`)
            if (cancelado) return
            setStatus(data.status)

            if (data.status === 'processed') {
              stopPolling()
              toast.success('Pago con tarjeta aprobado')
              onSuccess()
            } else if (ESTADOS_FALLO.includes(data.status)) {
              stopPolling()
              await cancelarVentaPendiente()
            }
          } catch {
            // sigue intentando en el próximo ciclo
          }
        }, POLL_MS)
      } catch (err) {
        if (cancelado) return
        setStatus('error')
        setErrorMsg((err as Error).message ?? 'No se pudo iniciar el cobro en la terminal')
        await cancelarVentaPendiente()
      }
    }

    void iniciar()

    return () => {
      cancelado = true
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId, monto, folio])

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
    await cancelarVentaPendiente()
    toast.info('Cobro cancelado')
    onClose()
  }

  const esperando = ESTADOS_ESPERA.includes(status)
  const fallo = status === 'error' || ESTADOS_FALLO.includes(status)

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

        {status === 'processed' && (
          <>
            <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
            <h3 className="mt-3 text-base font-semibold text-gray-800">Pago aprobado</h3>
            <p className="mt-1 text-sm text-gray-500">${monto.toFixed(2)} cobrados con tarjeta.</p>
          </>
        )}

        {fallo && (
          <>
            <XCircle className="mx-auto text-red-600" size={40} />
            <h3 className="mt-3 text-base font-semibold text-gray-800">
              {status === 'error' ? 'No se pudo iniciar el cobro' : 'El cobro no se completó'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {status === 'error' ? errorMsg : 'La orden fue cancelada o expiró en la terminal.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full py-2.5 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900"
            >
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
