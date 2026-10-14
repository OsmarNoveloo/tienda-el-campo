import { useState } from 'react'
import { Minus, Plus, PackagePlus, ScanLine } from 'lucide-react'
import type { StockProducto } from '../../hooks/useInventario'

const ATAJOS = [1, 6, 12, 24]

interface Props {
  producto: StockProducto
  guardando: boolean
  onConfirm: (cantidad: number, escanearOtro: boolean) => void
  onClose: () => void
}

function formatCantidad(value: number) {
  return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 3 })
}

export default function AgregarPiezasSheet({ producto, guardando, onConfirm, onClose }: Props) {
  const [cantidadInput, setCantidadInput] = useState('1')
  const cantidad = Number(cantidadInput)
  const cantidadValida = Number.isFinite(cantidad) && cantidad > 0
  const stockActual = Number(producto.stock_actual)

  const sumar = (n: number) => {
    const base = Number.isFinite(cantidad) ? cantidad : 0
    setCantidadInput(String(Math.max(0, Number((base + n).toFixed(3)))))
  }

  const confirmar = (escanearOtro: boolean) => {
    if (cantidadValida && !guardando) onConfirm(cantidad, escanearOtro)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Cerrar" />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="px-5 pt-3 pb-3 border-b border-gray-100">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
          <p className="text-xs font-medium text-emerald-600 inline-flex items-center gap-1">
            <PackagePlus size={13} /> Agregar piezas
          </p>
          <p className="text-base font-semibold text-gray-800 line-clamp-2">{producto.producto_nombre}</p>
          {producto.codigo_barras && <p className="text-xs text-gray-400 font-mono">{producto.codigo_barras}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            confirmar(false)
          }}
          className="p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sumar(-1)}
              className="h-14 w-14 shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
              aria-label="Restar uno"
            >
              <Minus size={20} />
            </button>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              onFocus={(e) => e.target.select()}
              value={cantidadInput}
              onChange={(e) => setCantidadInput(e.target.value)}
              className="flex-1 min-w-0 h-14 border border-gray-300 rounded-xl text-center text-3xl font-bold text-gray-800"
              aria-label="Piezas a agregar"
            />
            <button
              type="button"
              onClick={() => sumar(1)}
              className="h-14 w-14 shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
              aria-label="Sumar uno"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {ATAJOS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCantidadInput(String(n))}
                className={`h-10 rounded-lg border text-sm font-semibold ${
                  cantidad === n ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
            <span className="text-gray-600">Stock: <span className="font-semibold text-gray-800">{formatCantidad(stockActual)}</span></span>
            <span className="text-gray-600">
              Quedará en{' '}
              <span className="font-bold text-emerald-600">{formatCantidad(stockActual + (cantidadValida ? cantidad : 0))}</span>
            </span>
          </div>

          <div className="space-y-2 pb-[env(safe-area-inset-bottom)]">
            <button
              type="submit"
              disabled={!cantidadValida || guardando}
              className="w-full h-12 rounded-xl bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : `Agregar ${cantidadValida ? formatCantidad(cantidad) : ''} pzs`}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!cantidadValida || guardando}
                onClick={() => confirmar(true)}
                className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 disabled:opacity-50"
              >
                <ScanLine size={15} /> Guardar y escanear
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
