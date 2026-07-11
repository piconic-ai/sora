import type { Pair } from '../types'
import { idbDel, idbGet, idbPut } from './db'
import { deserializeDraft, serializeDraft } from './schema'

const STORE = 'drafts'
const KEY = 'current'

// Restores the last-saved draft, or null if there is none / it failed
// validation / IndexedDB is unavailable — every case the caller treats the
// same way: fall back to the pristine empty table.
export async function loadDraft(): Promise<Pair[] | null> {
  const raw = await idbGet<unknown>(STORE, KEY)
  const draft = deserializeDraft(raw)
  return draft ? draft.pairs : null
}

// Persists the current pairs as the single draft slot. An empty `pairs`
// means the user cleared the table back to nothing — that intent should
// stick, so the stored draft is deleted rather than saved as an empty one;
// otherwise the next reload would resurrect the input as-cleared.
export async function saveDraft(pairs: Pair[]): Promise<void> {
  if (pairs.length === 0) {
    await idbDel(STORE, KEY)
    return
  }
  await idbPut(STORE, serializeDraft(pairs, Date.now()), KEY)
}
