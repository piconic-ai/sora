import { idbDel, idbGet, idbPut } from './db'

// The carousel's "current" pointer: which document-mode list (src/lib/storage
// SavedList, in the 'lists' store) the center panel is showing/editing right
// now. Lives in the 'drafts' store under its own key ('active') rather than a
// new object store, so no DB_VERSION bump is needed — 'drafts' is already an
// out-of-line-key store that can hold more than one logical slot (see
// drafts.ts's 'current' key for the pre-carousel single-draft slot this
// pointer supersedes).
const STORE = 'drafts'
const KEY = 'active'

const ACTIVE_VERSION = 1

interface ActivePointer {
  v: 1
  activeListId: string
}

function isActivePointer(value: unknown): value is ActivePointer {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return p.v === ACTIVE_VERSION && typeof p.activeListId === 'string' && p.activeListId !== ''
}

// Resolves to the id of the currently-active list, or null if none has been
// set yet / the stored value fails validation / IndexedDB is unavailable —
// every case the caller treats the same way: there's no active list to show.
export async function getActiveListId(): Promise<string | null> {
  const raw = await idbGet<unknown>(STORE, KEY)
  return isActivePointer(raw) ? raw.activeListId : null
}

export async function setActiveListId(id: string): Promise<void> {
  const pointer: ActivePointer = { v: ACTIVE_VERSION, activeListId: id }
  await idbPut(STORE, pointer, KEY)
}

export async function clearActiveListId(): Promise<void> {
  await idbDel(STORE, KEY)
}
