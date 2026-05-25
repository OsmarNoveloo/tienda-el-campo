import { CreditCard } from 'lucide-react'

export default function CreditosPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="text-indigo-600" size={24} />
        <h1 className="text-2xl font-bold text-gray-800">Créditos</h1>
      </div>
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
        <CreditCard className="mx-auto text-gray-300 mb-3" size={48} />
        <p className="text-gray-400">Módulo en construcción</p>
      </div>
    </div>
  )
}
