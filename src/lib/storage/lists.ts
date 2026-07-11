import type { Pair } from '../types'
import { idbClear, idbDel, idbGet, idbGetAll, idbPut } from './db'
import { type SavedList, deserializeList, pairsEqual, serializeList } from './schema'

const STORE = 'lists'
const MAX_LISTS = 50

// Automatic history snapshot, taken on print and on "new list" — see
// components/App.tsx. Fire-and-forget from the caller's point of view (every
// db.ts primitive already fails soft), so a broken/unavailable IndexedDB
// just means history silently doesn't accumulate.
//
// `crypto.randomUUID()` / `Date.now()` are read here, at the edge of the
// pure schema layer, rather than in schema.ts's serializeList — keeping
// serializeList a pure function of its arguments is what makes it trivially
// testable.
export async function saveList(pairs: Pair[]): Promise<void> {
  if (pairs.length === 0) return

  // Newest-first: the most recent entry is what a repeated, unedited print
  // would duplicate, so it's the one to compare against.
  const existing = await listSaved()
  const latest = existing[0]
  if (latest && pairsEqual(latest.pairs, pairs)) return

  const entry = serializeList(crypto.randomUUID(), pairs, Date.now())
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
