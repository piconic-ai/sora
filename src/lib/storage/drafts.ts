import type { Pair } from '../types'
import { idbGet } from './db'
import { deserializeDraft } from './schema'

const STORE = 'drafts'
const KEY = 'current'

// Restores the pre-carousel single draft, or null if there is none / it
// failed validation / IndexedDB is unavailable. Read-only: the draft slot is
// never written by the app anymore — it exists solely so migrateLegacyDraft()
// can fold a legacy draft into a document-mode list on first run.
export async function loadDraft(): Promise<Pair[] | null> {
  const raw = await idbGet<unknown>(STORE, KEY)
  const draft = deserializeDraft(raw)
  return draft ? draft.pairs : null
}
