import { useState } from 'react'
import { PauseCircle, ShoppingBag, Trash2, X } from 'lucide-react'
import type { Producto } from '../../types/database'
import ConfirmDialog from '../common/ConfirmDialog'

type CartItem = {
  producto: Producto
  cantidad: number
  isQuickItem?: boolean
  quickCode?: string
}

type HeldCart = {
  id: string
  carrito: CartItem[]
  tipoCobro: 'CONTADO' | 'CREDITO'
  clienteCreditoId: number | ''
  creadoEn: string
}

interface Props {
  carritosEnEspera: HeldCart[]
  onReanudar: (id: string) => void
  onDescartar: (id: string) => void
  onClose: () => void
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function totales(carrito: CartItem[]) {
  const items = carrito.reduce((acc, item) => acc + item.cantidad, 0)
  const monto = carrito.reduce((acc, item) => acc + Number(item.producto.precio_actual) * item.cantidad, 0)
  return { items, monto }
}

function resumenProductos(carrito: CartItem[]) {
  return carrito.map((item) => `${item.cantidad}× ${item.producto.nombre}`).join(', ')
}

export default function PosVentasEnEspera({ carritosEnEspera, onReanudar, onDescartar, onClose }: Props) {
  const [porDescartar, setPorDescartar] = useState<HeldCart | null>(null)

  const confirmarDescarte = () => {
    if (!porDescartar) return
    onDescartar(porDescartar.id)
    setPorDescartar(null)
  }

  const totalesDescarte = porDescartar ? totales(porDescartar.carrito) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-50 rounded-lg p-1.5">
              <PauseCircle size={16} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Ventas en espera</h2>
              <p className="text-xs text-gray-500">Toca una para reanudarla</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {carritosEnEspera.length === 0 ? (
            <div className="p-10 text-center">
              <ShoppingBag className="mx-auto text-gray-200 mb-3" size={40} />
              <p className="text-sm text-gray-400">No hay ventas en espera.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {carritosEnEspera.map((held, index) => {
                const { items, monto } = totales(held.carrito)

                return (
                  <div key={held.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onReanudar(held.id)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          Venta {index + 1} · {items} artículo{items === 1 ? '' : 's'}
                          {held.tipoCobro === 'CREDITO' && (
                            <span className="ml-1.5 text-[10px] font-semibold text-amber-600 uppercase">crédito</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          desde las {formatHora(held.creadoEn)} · {resumenProductos(held.carrito)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-gray-700">${monto.toFixed(2)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPorDescartar(held)}
                      className="shrink-0 mr-3 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Descartar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {porDescartar && (
        <ConfirmDialog
          title="¿Descartar esta venta en espera?"
          description={`${totalesDescarte!.items} artículo${totalesDescarte!.items === 1 ? '' : 's'} · $${totalesDescarte!.monto.toFixed(2)} — se perderán los productos, esta acción no se puede deshacer.`}
          confirmLabel="Sí, descartar"
          onConfirm={confirmarDescarte}
          onCancel={() => setPorDescartar(null)}
        />
      )}
    </div>
  )
}
