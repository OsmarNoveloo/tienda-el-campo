import { ArrowLeft, NotebookPen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

const AUTOSAVE_DELAY_MS = 700
const NOTES_FALLBACK_STORAGE_KEY = 'tienda-config-notes-fallback'

function isRlsError(message: string | null | undefined) {
  return (message ?? '').toLowerCase().includes('row-level security')
}

export default function NotasPage() {
  const { user } = useAuth()
  const [notes, setNotes] = useState('')
  const [noteId, setNoteId] = useState<number | null>(null)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [savingNotes, setSavingNotes] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [usingLocalFallback, setUsingLocalFallback] = useState(false)

  const loadedRef = useRef(false)
  const lastSavedRef = useRef('')

  useEffect(() => {
    let active = true

    const loadNotes = async () => {
      setLoadingNotes(true)
      setSaveError(null)

      const { data, error } = await supabase
        .from('notas')
        .select('id,contenido')
        .eq('es_global', true)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active) return

      if (error) {
        if (isRlsError(error.message)) {
          const localDraft = window.localStorage.getItem(NOTES_FALLBACK_STORAGE_KEY) ?? ''
          setNotes(localDraft)
          lastSavedRef.current = localDraft
          setUsingLocalFallback(true)
          toast.warning('RLS activo en notas. Se usarán notas locales temporalmente.')
        } else {
          toast.error(`No se pudieron cargar las notas: ${error.message}`)
        }
        setSaveError(error.message)
        setLoadingNotes(false)
        loadedRef.current = true
        return
      }

      const content = data?.contenido ?? ''
      setNotes(content)
      setNoteId(data?.id ?? null)
      lastSavedRef.current = content
      setLoadingNotes(false)
      loadedRef.current = true
    }

    void loadNotes()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!loadedRef.current) return
    if (notes === lastSavedRef.current) return

    if (usingLocalFallback) {
      window.localStorage.setItem(NOTES_FALLBACK_STORAGE_KEY, notes)
      lastSavedRef.current = notes
      return
    }

    const timer = window.setTimeout(async () => {
      setSavingNotes(true)
      setSaveError(null)

      if (noteId) {
        const { error } = await supabase
          .from('notas')
          .update({
            contenido: notes,
          })
          .eq('id', noteId)

        if (error) {
          if (isRlsError(error.message)) {
            setUsingLocalFallback(true)
            window.localStorage.setItem(NOTES_FALLBACK_STORAGE_KEY, notes)
            lastSavedRef.current = notes
            setSavingNotes(false)
            setSaveError('RLS activo en notas. Guardando localmente.')
            toast.warning('RLS bloqueó notas. Se activó guardado local temporal.')
            return
          }
          setSaveError(error.message)
          toast.error(`No se pudieron guardar las notas: ${error.message}`)
          setSavingNotes(false)
          return
        }

        lastSavedRef.current = notes
        setSavingNotes(false)
        return
      }

      const { data, error } = await supabase
        .from('notas')
        .insert([
          {
            contenido: notes,
            es_global: true,
            usuario_id: user?.id ?? null,
          },
        ])
        .select('id')
        .single()

      if (error) {
        if (isRlsError(error.message)) {
          setUsingLocalFallback(true)
          window.localStorage.setItem(NOTES_FALLBACK_STORAGE_KEY, notes)
          lastSavedRef.current = notes
          setSavingNotes(false)
          setSaveError('RLS activo en notas. Guardando localmente.')
          toast.warning('RLS bloqueó notas. Se activó guardado local temporal.')
          return
        }
        setSaveError(error.message)
        toast.error(`No se pudieron guardar las notas: ${error.message}`)
        setSavingNotes(false)
        return
      }

      setNoteId(data.id)
      lastSavedRef.current = notes
      setSavingNotes(false)
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [notes, noteId, user?.id, usingLocalFallback])

  const notesCount = useMemo(() => notes.trim().length, [notes])

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <NotebookPen className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-800">Notas del Sistema</h1>
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:border-indigo-200 hover:text-indigo-600"
        >
          <ArrowLeft size={16} />
          Volver al Dashboard
        </Link>
      </div>

      {/* <p className="text-sm text-gray-500 mb-4">
        Este espacio se guarda automáticamente en la base de datos.
      </p> */}

      <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={loadingNotes}
          className="w-full min-h-90 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="Escribe recordatorios operativos, tareas pendientes o acuerdos del equipo."
        />

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {loadingNotes
              ? 'Cargando notas...'
              : usingLocalFallback
                ? 'Guardado local temporal activo (RLS en base).'
              : savingNotes
                ? 'Guardando...'
                : saveError
                  ? 'Error al guardar. Intenta de nuevo.'
                  : 'Guardado automático activo.'}
          </span>
          <span>{notesCount} caracteres</span>
        </div>
      </section>
    </div>
  )
}
