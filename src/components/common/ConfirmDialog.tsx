import { AlertTriangle } from 'lucide-react'

interface Props {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Sí, continuar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 bg-red-50 rounded-full p-2">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
