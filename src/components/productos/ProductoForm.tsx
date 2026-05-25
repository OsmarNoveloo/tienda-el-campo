import { useEffect } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import type { Producto } from '../../types/database'

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  codigo_barras: z.string().optional(),
  sku: z.string().optional(),
  descripcion: z.string().optional(),
  costo_actual: z.coerce.number().min(0, 'Debe ser mayor o igual a 0'),
  precio_actual: z.coerce.number().min(0, 'Debe ser mayor o igual a 0'),
  stock_minimo: z.coerce.number().min(0, 'Debe ser mayor o igual a 0'),
  activo: z.boolean(),
})

type FormValues = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

interface Props {
  producto?: Producto | null
  onClose: () => void
  onSubmit: (values: FormOutput) => Promise<void>
}

export default function ProductoForm({ producto, onClose, onSubmit }: Props) {
  "use no memo"
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de barras</label>
              <input
                {...register('codigo_barras')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0000000000000"
              />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio $</label>
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
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : producto ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
