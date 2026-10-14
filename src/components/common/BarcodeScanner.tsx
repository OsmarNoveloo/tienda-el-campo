import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { BARCODE_FORMATS, beep } from '../../lib/barcode'

const SCANNER_REGION_ID = 'barcode-scanner-region'
// Evita contar dos veces el mismo código mientras sigue frente a la cámara
const SAME_CODE_COOLDOWN_MS = 1500

interface Props {
  title?: string
  /** Si es true la cámara sigue abierta después de cada lectura */
  continuous?: boolean
  onDetected: (code: string) => void
  onClose: () => void
  /** Contenido extra debajo de la cámara (ej. último producto escaneado) */
  footer?: ReactNode
}

function getScannerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'No se pudo iniciar la cámara.')
  const normalized = message.toLowerCase()

  if (normalized.includes('notallowed') || normalized.includes('permission')) {
    return 'Permiso de cámara denegado. Habilítalo en el navegador e intenta de nuevo.'
  }
  if (normalized.includes('notfound') || normalized.includes('devicesnotfound')) {
    return 'No se encontró cámara disponible en este dispositivo.'
  }
  if (normalized.includes('insecure') || normalized.includes('https')) {
    return 'La cámara requiere HTTPS o localhost para funcionar.'
  }

  return message
}

export default function BarcodeScanner({ title = 'Escanear código', continuous = false, onDetected, onClose, footer }: Props) {
  "use no memo"
  const [error, setError] = useState<string | null>(null)
  const onDetectedRef = useRef(onDetected)
  const onCloseRef = useRef(onClose)

  useLayoutEffect(() => {
    onDetectedRef.current = onDetected
    onCloseRef.current = onClose
  })

  useEffect(() => {
    let cancelled = false
    let scanner: Html5Qrcode | null = null
    let active = false
    let lastCode = ''
    let lastAt = 0

    const handleDecoded = (decodedText: string) => {
      const code = decodedText.trim()
      if (!code) return

      const now = Date.now()
      if (code === lastCode && now - lastAt < SAME_CODE_COOLDOWN_MS) return
      lastCode = code
      lastAt = now

      beep()
      onDetectedRef.current(code)
      if (!continuous) onCloseRef.current()
    }

    const start = async () => {
      const config = { fps: 10, qrbox: { width: 280, height: 160 } }
      // Primero exige la cámara trasera; algunos navegadores no aceptan "exact" y se reintenta sin él
      for (const facingMode of [{ exact: 'environment' }, 'environment'] as const) {
        if (cancelled) return
        try {
          scanner = new Html5Qrcode(SCANNER_REGION_ID, { formatsToSupport: BARCODE_FORMATS, verbose: false })
          await scanner.start({ facingMode }, config, handleDecoded, () => {
            // Ignora los callbacks continuos de "no encontrado"
          })
          active = true
          if (cancelled) await stop()
          return
        } catch (err) {
          if (facingMode === 'environment') setError(getScannerErrorMessage(err))
        }
      }
    }

    const stop = async () => {
      if (!scanner) return
      const current = scanner
      scanner = null
      if (active) {
        active = false
        try { await current.stop() } catch { /* ignorar */ }
      }
      try { current.clear() } catch { /* ignorar */ }
    }

    void start()

    return () => {
      cancelled = true
      void stop()
    }
  }, [continuous])

  return (
    <div className="fixed inset-0 z-60 bg-black/70 p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Cerrar cámara">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
          <div id={SCANNER_REGION_ID} className="w-full min-h-64" />
        </div>

        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

        <p className="mt-2 text-xs text-gray-500">
          {continuous
            ? 'Pasa los productos uno tras otro frente a la cámara. Cada lectura suena y se agrega a la lista.'
            : 'Apunta la cámara al código de barras. Se completará automáticamente al detectarlo.'}
        </p>

        {footer}

        {continuous && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Terminar de escanear
          </button>
        )}
      </div>
    </div>
  )
}
