// Minimal, dependency-free Promise wrapper around IndexedDB.
//
// Every function here fails soft: if IndexedDB is unavailable (SSR — see
// isStorageAvailable — or disabled/restricted, e.g. some private-browsing
// modes) or an operation errors for any reason, the call resolves to a
// null/no-op result instead of throwing or rejecting. Callers never need a
// try/catch around these — the app must keep working with drafts simply not
// persisting.

const DB_NAME = 'sora'
const DB_VERSION = 2

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

// Per-version schema migrations, applied in ascending order from
// oldVersion+1 through DB_VERSION. Add a new `if (oldVersion < N)` branch for
// each future version bump instead of editing existing branches, so a
// browser upgrading from any past version replays every migration it missed.
function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    // Out-of-line keys (no keyPath): the key is passed explicitly to
    // put/get/delete rather than read off the stored value.
    db.createObjectStore('drafts')
  }
  if (oldVersion < 2) {
    // In-line key (keyPath: 'id'): SavedList already carries its own `id`,
    // so put()/get()/delete() work off that field rather than a key passed
    // alongside the value. The `createdAt` index exists for potential future
    // range queries; lists.ts currently just idbGetAll + sorts in memory,
    // which is plenty fast at the 50-item cap.
    const store = db.createObjectStore('lists', { keyPath: 'id' })
    store.createIndex('createdAt', 'createdAt')
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null
let warned = false

// Log a single fail-soft warning per session so a "drafts aren't saving"
// problem is diagnosable, without spamming the console on every operation.
function warnOnce(reason: string): void {
  if (warned) return
  warned = true
  console.warn(`[sora] IndexedDB unavailable, drafts will not persist: ${reason}`)
}

// Opens (and caches) the shared 'sora' database connection. Resolves to
// null — rather than rejecting — whenever the connection can't be
// established, so callers can treat "no database" as a normal case. A failed
// open is not cached: dbPromise is reset so the next call retries (a failure
// may be transient — quota pressure, a competing upgrade in another tab).
export function openSoraDb(): Promise<IDBDatabase | null> {
  if (!isStorageAvailable()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    const fail = (reason: string) => {
      warnOnce(reason)
      dbPromise = null // allow a later retry rather than caching the failure
      resolve(null)
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      fail(String(e))
      return
    }
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion)
    request.onsuccess = () => {
      const db = request.result
      // If another tab later opens a higher version, close this connection so
      // it doesn't block that upgrade; drop the cache so the next call
      // reopens at the new version.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => fail('open error')
    // Another tab holds an older-version connection open; rather than hang
    // waiting for it to close, treat this attempt as unavailable — the
    // caller's fail-soft handling covers "no database" cases already.
    request.onblocked = () => fail('blocked by another tab')
  })

  return dbPromise
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openSoraDb().then((db) => {
    if (!db) return null
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(storeName, mode)
        const request = run(tx.objectStore(storeName))
        let result: T | null = null
        request.onsuccess = () => {
          result = request.result ?? null
        }
        // Resolve on tx.oncomplete, not request.onsuccess: for writes the
        // success event fires before commit, which can still abort (e.g. on
        // quota) and roll the write back. oncomplete means it's durable.
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => resolve(null)
        tx.onabort = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  })
}

export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  return runRequest<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>)
}

// `key` is only needed for out-of-line stores (e.g. 'drafts'). In-line
// (keyPath) stores like 'lists' carry their own key on the value and must be
// put() without a second argument — passing one alongside an in-line key
// throws a DataError.
export async function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  await runRequest<IDBValidKey>(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)))
}

export async function idbDel(store: string, key: IDBValidKey): Promise<void> {
  await runRequest<undefined>(store, 'readwrite', (s) => s.delete(key))
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const result = await runRequest<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
  return result ?? []
}

export async function idbClear(store: string): Promise<void> {
  await runRequest<undefined>(store, 'readwrite', (s) => s.clear())
}
