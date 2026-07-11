import type { Pair } from '../types'
import { idbClear, idbDel, idbGet, idbGetAll, idbPut } from './db'
import { type SavedList, deserializeList, pairsEqual, serializeList } from './schema'

const STORE = 'lists'
const MAX_LISTS = 50

// `crypto.randomUUID()` is only defined in secure contexts (HTTPS or
// localhost) — calling it over plain HTTP (e.g. a LAN IP during local
// testing) throws a TypeError. Fall back to a non-cryptographic but
// sufficiently-unique id in that case, matching db.ts's fail-soft policy of
// never letting storage plumbing throw.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Automatic history snapshot, taken on print and on "new list" — see
// components/App.tsx. Fire-and-forget from the caller's point of view (every
// db.ts primitive already fails soft), so a broken/unavailable IndexedDB
// just means history silently doesn't accumulate.
//
// `generateId()` / `Date.now()` are read here, at the edge of the pure
// schema layer, rather than in schema.ts's serializeList — keeping
// serializeList a pure function of its arguments is what makes it trivially
// testable.
export async function saveList(pairs: Pair[]): Promise<void> {
  if (pairs.length === 0) return

  // Duplicate-save detection: skip writing a new snapshot if its content
  // matches *any* existing saved list, not just the most recent one — the
  // requirement is "never store a duplicate", not just "never store a
  // duplicate of the last print".
  const existing = await listSaved()
  if (existing.some((item) => pairsEqual(item.pairs, pairs))) return

  const entry = serializeList(generateId(), pairs, Date.now())
  await idbPut(STORE, entry)

  // Cap at MAX_LISTS, oldest first. `existing` is newest-first and doesn't
  // yet include `entry`, so the total after this write is existing.length +
  // 1, and the oldest surplus lives at the tail of `existing`.
  const total = existing.length + 1
  if (total > MAX_LISTS) {
    const overflow = existing.slice(-(total - MAX_LISTS))
    await Promise.all(overflow.map((item) => idbDel(STORE, item.id)))
  }
}

// All saved lists, newest first. Entries that fail deserializeList's
// shape/version check (corrupted or from a future/incompatible version) are
// silently dropped rather than surfaced as an error.
export async function listSaved(): Promise<SavedList[]> {
  const raw = await idbGetAll<unknown>(STORE)
  const lists: SavedList[] = []
  for (const item of raw) {
    const parsed = deserializeList(item)
    if (parsed) lists.push(parsed)
  }
  return lists.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getList(id: string): Promise<SavedList | null> {
  const raw = await idbGet<unknown>(STORE, id)
  return deserializeList(raw)
}

export async function deleteList(id: string): Promise<void> {
  await idbDel(STORE, id)
}

export async function clearAllLists(): Promise<void> {
  await idbClear(STORE)
}
