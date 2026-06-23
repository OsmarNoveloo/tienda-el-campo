import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../lib/apiClient'
import {
  countPendingVentas,
  getPendingVentas,
  removePendingVenta,
  type PendingVenta,
} from '../lib/posOfflineDB'

async function syncOne(venta: PendingVenta): Promise<boolean> {
  try {
    await api.post('/ventas', {
      ...venta.ventaPayload,
      detalle: venta.detallePayload,
      movimientos: venta.movimientosPayload,
      credito: venta.creditoPayload,
    })
    await removePendingVenta(venta.localId!)
    return true
  } catch {
    return false
  }
}

export function usePosOfflineSync(onSyncComplete?: () => void) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncingRef = useRef(false)

  const refreshPendingCount = useCallback(async () => {
    const count = await countPendingVentas()
    setPendingCount(count)
  }, [])

  const syncPendingVentas = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setIsSyncing(true)

    try {
      const pending = await getPendingVentas()
      if (pending.length === 0) return

      let synced = 0
      let failed = 0

      for (const venta of pending) {
        const ok = await syncOne(venta)
        if (ok) synced++
        else failed++
      }

      await refreshPendingCount()

      if (synced > 0) {
        toast.success(`${synced} venta${synced > 1 ? 's' : ''} sincronizada${synced > 1 ? 's' : ''} con el servidor`)
        onSyncComplete?.()
      }
      if (failed > 0) {
        toast.error(`${failed} venta${failed > 1 ? 's' : ''} no se pudieron sincronizar`)
      }
    } finally {
      setIsSyncing(false)
      syncingRef.current = false
    }
  }, [refreshPendingCount, onSyncComplete])

  useEffect(() => {
    void refreshPendingCount()

    const handleOnline = () => { setIsOnline(true); void syncPendingVentas() }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.onLine) void syncPendingVentas()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshPendingCount, syncPendingVentas])

  return { isOnline, pendingCount, isSyncing, syncPendingVentas, refreshPendingCount }
}
