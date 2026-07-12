import type { Pair } from '../types'
import { idbClear, idbDel, idbGet, idbGetAll, idbPut } from './db'
import { generateId } from './id'
import { type SavedList, deserializeList, pairsEqual, serializeList } from './schema'

const STORE = 'lists'
export const MAX_LISTS = 50

// Creates a brand-new document-mode list: a fresh URL-safe id, createdAt ==
// updatedAt == now. No dedup and no MAX_LISTS eviction here — those are
// history-popover-specific policies that belong to saveList()'s caller
// (App.tsx), not to "create a list" itself.
//
// `overrides` lets a caller pin `id`/`createdAt` instead of generating them
// here. This exists for the carousel's "new card" flow (App.tsx): a fresh
// card is assigned an id and a createdAt the moment it's created in memory —
// which fixes its position in the creation-order carousel and the URL it's
// reachable at — but is only written to IndexedDB once the user types its
// first pair. Writing it then with a *new* id/createdAt would silently move
// it and change its URL, so the first real write reuses the id/createdAt
// that were already handed out. `updatedAt` is always "now" (the moment of
// the actual write), regardless of overrides.
export async function createList(
  pairs: Pair[],
  overrides?: { id?: string; createdAt?: number },
): Promise<SavedList> {
  const now = Date.now()
  const id = overrides?.id ?? generateId()
  const createdAt = overrides?.createdAt ?? now
  const entry = serializeList(id, pairs, createdAt, now)
  await idbPut(STORE, entry)
  return entry
}

// In-place update of an existing document-mode list: pairs change, updatedAt
// advances to now, but `id`/`createdAt` — and therefore its fixed position in
// the carousel's creation-order — are preserved. A no-op if `id` doesn't
// exist (e.g. it was deleted from another tab/carousel position in the
// meantime) or if `pairs` is unchanged from what's already stored, so callers
// can call this on every keystroke/blur without worrying about redundant
// writes or resurrecting a deleted list.
export async function updateList(id: string, pairs: Pair[]): Promise<void> {
  const existing = await getList(id)
  if (!existing) return
  if (pairsEqual(existing.pairs, pairs)) return

  const entry = serializeList(id, pairs, existing.createdAt, Date.now())
  await idbPut(STORE, entry)
}

// Automatic history snapshot, taken on print and on "new list" — see
// components/App.tsx. Fire-and-forget from the caller's point of view (every
// db.ts primitive already fails soft), so a broken/unavailable IndexedDB
// just means history silently doesn't accumulate.
export async function saveList(pairs: Pair[]): Promise<void> {
  if (pairs.length === 0) return

  // Duplicate-save detection: skip writing a new snapshot if its content
  // matches *any* existing saved list, not just the most recent one — the
  // requirement is "never store a duplicate", not just "never store a
  // duplicate of the last print".
  const existing = await listSaved()
  if (existing.some((item) => pairsEqual(item.pairs, pairs))) return

  await createList(pairs)

  // Cap at MAX_LISTS, oldest first. `existing` is newest-first and doesn't
  // yet include the just-created entry, so the total after this write is
  // existing.length + 1, and the oldest surplus lives at the tail of
  // `existing`.
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
