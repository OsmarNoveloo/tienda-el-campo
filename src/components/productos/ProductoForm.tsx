import { useEffect, useRef, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Camera, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import type { Producto } from '../../types/database'

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  codigo_barras: z.string().optional(),
  sku: z.string().optional(),
  descripcion: z.string().optional(),
  costo_actual: z.coerce.number().min(0, 'Debe ser mayor o igual a 0'),
  precio_actual: z.coerce.number().min(0.01, 'El precio es requerido'),
  stock_minimo: z.coerce.number().min(0, 'Debe ser mayor o igual a 0'),
  activo: z.boolean(),
})

const SCANNER_REGION_ID = 'producto-barcode-scanner-region'
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

type FormValues = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

interface Props {
  producto?: Producto | null
  onClose: () => void
  onSubmit: (values: FormOutput) => Promise<void>
}

export default function ProductoForm({ producto, onClose, onSubmit }: Props) {
  "use no memo"
  const { register, handleSubmit, reset, setValue, getValues, formState: { errors, isSubmitting, isValid } } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      codigo_barras: '',
      sku: '',
      descripcion: '',
      costo_actual: 0,
      precio_actual: 0,
      stock_minimo: 0,
      activo: true,
    },
  })

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerActiveRef = useRef(false)
  const canSubmit = isValid

  useEffect(() => {
    if (producto) {
      reset({
        nombre: producto.nombre,
        codigo_barras: producto.codigo_barras ?? '',
        sku: producto.sku ?? '',
        descripcion: producto.descripcion ?? '',
        costo_actual: producto.costo_actual,
        precio_actual: producto.precio_actual,
        stock_minimo: producto.stock_minimo,
        activo: producto.activo,
      })
    }
  }, [producto, reset])

  const handleFormSubmit: SubmitHandler<FormOutput> = async (values) => {
    await onSubmit(values)
  }

  const stopScanner = async () => {
    if (scannerRef.current && scannerActiveRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // Ignore stop errors.
      }
      try {
        await scannerRef.current.clear()
      } catch {
        // Ignore clear errors.
      }
      scannerActiveRef.current = false
    }
    scannerRef.current = null
  }

  const applyDetectedCode = (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) return

    setValue('codigo_barras', code, { shouldDirty: true, shouldValidate: true })
    if (!getValues('sku')?.trim()) {
      setValue('sku', code, { shouldDirty: true, shouldValidate: true })
    }
    toast.success('Código detectado y autollenado')
  }

  const getScannerErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'No se pudo iniciar la cámara.'
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

  const openScanner = () => {
    setScannerError(null)
    setScannerOpen(true)
  }

  const closeScanner = () => {
    setScannerOpen(false)
  }

  useEffect(() => {
    if (!scannerOpen) return

    let cancelled = false

    const startScanner = async () => {
      setScannerError(null)

      // Espera un tick para asegurar que el contenedor exista en el DOM.
      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 0)
      })

      if (cancelled) return

      const region = document.getElementById(SCANNER_REGION_ID)
      if (!region) {
        setScannerError('No se pudo preparar el lector de cámara.')
        return
      }

      try {
        const scanner = new Html5Qrcode(SCANNER_REGION_ID, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: { exact: 'environment' } },
          { fps: 10, qrbox: { width: 280, height: 160 } },
          (decodedText) => {
            applyDetectedCode(decodedText)
            void stopScanner()
            setScannerOpen(false)
          },
          () => {
            // Ignore continuous not-found callbacks.
          },
        )

        if (cancelled) {
          await stopScanner()
          return
        }

        scannerActiveRef.current = true
      } catch (error) {
        try {
          const scanner = new Html5Qrcode(SCANNER_REGION_ID, {
            formatsToSupport: SUPPORTED_FORMATS,
            verbose: false,
          })
          scannerRef.current = scanner

          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 280, height: 160 } },
            (decodedText) => {
              applyDetectedCode(decodedText)
              void stopScanner()
              setScannerOpen(false)
            },
            () => {
              // Ignore continuous not-found callbacks.
            },
          )

          if (cancelled) {
            await stopScanner()
            return
          }

          scannerActiveRef.current = true
        } catch (fallbackError) {
          setScannerError(getScannerErrorMessage(fallbackError))
        }
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [scannerOpen])

  useEffect(() => {
    return () => {
      void stopScanner()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {producto ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="px-6 py-5 flex flex-col gap-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              {...register('nombre')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nombre del producto"
            />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
          </div>

          {/* Código de barras y SKU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-sm font-medium text-gray-700">Código de barras</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openScanner}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-indigo-200 hover:text-indigo-600"
                  >
                    <Camera size={13} />
                    Cámara
                  </button>
                </div>
              </div>
              <input
                {...register('codigo_barras')}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0000000000000"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Puedes escanear en vivo con la cámara para detectar código y autollenar.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input
                {...register('sku')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="SKU-001"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              {...register('descripcion')}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Descripción opcional"
            />
          </div>

          {/* Costo, Precio y Stock mínimo */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo $</label>
              <input
                {...register('costo_actual')}
                type="number"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.costo_actual && <p className="text-red-500 text-xs mt-1">{errors.costo_actual.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio $ *</label>
              <input
                {...register('precio_actual')}
                type="number"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.precio_actual && <p className="text-red-500 text-xs mt-1">{errors.precio_actual.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock mín.</label>
              <input
                {...register('stock_minimo')}
                type="number"
                step="0.001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.stock_minimo && <p className="text-red-500 text-xs mt-1">{errors.stock_minimo.message}</p>}
            </div>
          </div>

          {/* Activo */}
          <div className="flex items-center gap-2">
            <input
              {...register('activo')}
              type="checkbox"
              id="activo"
              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <label htmlFor="activo" className="text-sm font-medium text-gray-700">Producto activo</label>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : producto ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>

        {scannerOpen && (
          <div className="fixed inset-0 z-60 bg-black/70 p-4 flex items-center justify-center">
            <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Escanear código</h3>
                <button
                  type="button"
                  onClick={closeScanner}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
                <div id={SCANNER_REGION_ID} className="w-full h-64" />
              </div>

              {scannerError && (
                <p className="mt-2 text-xs text-rose-600">{scannerError}</p>
              )}

              <p className="mt-2 text-xs text-gray-500">
                Apunta la cámara al código de barras. Se completará automáticamente al detectarlo.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
