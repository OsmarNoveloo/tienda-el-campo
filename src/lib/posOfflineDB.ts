import type { Producto } from '../types/database'

export type ClienteCacheItem = {
  id: number
  nombre: string
  limite_credito: number | null
}

export type PendingVenta = {
  localId?: number
  folio: string
  ventaPayload: Record<string, unknown>
  detallePayload: Array<Record<string, unknown>>
  movimientosPayload: Array<Record<string, unknown>>
  creditoPayload: Record<string, unknown> | null
  createdAt: string
}

const DB_NAME = 'pos-offline-db'
const DB_VERSION = 1

let _db: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!_db) {
    _db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('productos'))
          db.createObjectStore('productos', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('clientes'))
          db.createObjectStore('clientes', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('ventas_pendientes'))
          db.createObjectStore('ventas_pendientes', { keyPath: 'localId', autoIncrement: true })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        _db = null
        reject(req.error)
      }
    })
  }
  return _db
}

async function getAll<T>(store: string): Promise<T[]> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

async function replaceAll<T>(store: string, items: T[]): Promise<void> {
  try {
    const db = await getDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      const s = tx.objectStore(store)
      s.clear()
      for (const item of items) s.put(item)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore cache errors */ }
}

export async function saveProductosToCache(productos: Producto[]): Promise<void> {
  await replaceAll('productos', productos)
}

export async function getProductosFromCache(): Promise<Producto[]> {
  return getAll<Producto>('productos')
}

export async function saveClientesToCache(clientes: ClienteCacheItem[]): Promise<void> {
  await replaceAll('clientes', clientes)
}

export async function getClientesFromCache(): Promise<ClienteCacheItem[]> {
  return getAll<ClienteCacheItem>('clientes')
}

export async function queueVenta(venta: Omit<PendingVenta, 'localId'>): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ventas_pendientes', 'readwrite')
    tx.objectStore('ventas_pendientes').add(venta)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPendingVentas(): Promise<PendingVenta[]> {
  return getAll<PendingVenta>('ventas_pendientes')
}

export async function removePendingVenta(localId: number): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ventas_pendientes', 'readwrite')
    tx.objectStore('ventas_pendientes').delete(localId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function countPendingVentas(): Promise<number> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const req = db.transaction('ventas_pendientes', 'readonly').objectStore('ventas_pendientes').count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return 0
  }
}

// Caja cache — localStorage es suficiente para un objeto pequeño
export function saveCajaToCache(caja: { id: number; monto_apertura: number } | null): void {
  try {
    if (caja) localStorage.setItem('pos_caja_cache', JSON.stringify(caja))
    else localStorage.removeItem('pos_caja_cache')
  } catch { /* ignore */ }
}

export function getCajaFromCache(): { id: number; monto_apertura: number } | null {
  try {
    const raw = localStorage.getItem('pos_caja_cache')
    return raw ? (JSON.parse(raw) as { id: number; monto_apertura: number }) : null
  } catch {
    return null
  }
}

export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')
}
