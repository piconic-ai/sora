import type { Pair } from '../types'
import { idbClear, idbDel, idbGet, idbGetAll, idbPut } from './db'
import { generateId } from './id'
import { type SavedList, deserializeList, normalizeTitle, pairsEqual, serializeList } from './schema'

const STORE = 'lists'
export const MAX_LISTS = 50

// Creates a brand-new document-mode list: a fresh URL-safe id, createdAt ==
// updatedAt == now. No dedup and no MAX_LISTS eviction here — the carousel's
// eviction policy lives in its caller (App.tsx's createNewList), not in
// "create a list" itself.
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
//
// `overrides.title` carries a custom name set before the card's first real
// write (App's inline rename can fire while the card is still memory-only), so
// that title survives into the first persisted record.
export async function createList(
  pairs: Pair[],
  overrides?: { id?: string; createdAt?: number; title?: string },
): Promise<SavedList> {
  const now = Date.now()
  const id = overrides?.id ?? generateId()
  const createdAt = overrides?.createdAt ?? now
  const entry = serializeList(id, pairs, createdAt, now, overrides?.title)
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

  // Preserve the custom title across a pairs update — serializeList rebuilds
  // the whole record from scratch, so without threading existing.title back
  // through, every autosave would silently wipe a renamed list's name.
  const entry = serializeList(id, pairs, existing.createdAt, Date.now(), existing.title)
  await idbPut(STORE, entry)
}

// Sets (or clears) a list's custom title without touching its pairs. A no-op
// if `id` doesn't exist (deleted elsewhere in the meantime) — App additionally
// skips calling this for tombstoned ids so a rename can't resurrect a record.
// `updatedAt` advances; `id`/`createdAt`/`pairs` are preserved. An empty/blank
// title clears the name (normalizeTitle -> undefined), reverting to the
// auto-generated label.
export async function renameList(id: string, rawTitle: string): Promise<void> {
  const existing = await getList(id)
  if (!existing) return

  const title = normalizeTitle(rawTitle)
  const entry = serializeList(id, existing.pairs, existing.createdAt, Date.now(), title)
  await idbPut(STORE, entry)
}

// Single-transaction, no-read overwrite of a list record — the fast path for
// the carousel's "flush on page hide" (App.tsx). Unlike updateList/createList
// it does no getList round-trip and no pairsEqual dedup: it just puts the
// record in one IndexedDB transaction, which is what a pagehide/visibility-
// change handler needs so the most recent edit is durable before the tab goes
// away (a multi-step read-then-write can lose the race with an unloading
// page). The caller supplies a fully-formed SavedList (id/createdAt preserved,
// updatedAt already advanced).
export async function putListDirect(list: SavedList): Promise<void> {
  await idbPut(STORE, list)
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
