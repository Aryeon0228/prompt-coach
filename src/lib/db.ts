import type { Project } from '../types'

/**
 * Projects live in IndexedDB (screenshots are data URLs, too big for localStorage). No server:
 * a student's work stays on their device and leaves it only as an exported JSON file.
 */
const NAME = 'prompt-coach'
const STORE = 'projects'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

export const db = {
  all: () => run<Project[]>('readonly', (s) => s.getAll()),
  get: (id: string) => run<Project | undefined>('readonly', (s) => s.get(id)),
  put: (p: Project) => run('readwrite', (s) => s.put(p)),
  remove: (id: string) => run('readwrite', (s) => s.delete(id)),
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
