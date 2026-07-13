import { getActiveListId, setActiveListId } from './active'
import { idbDel } from './db'
import { loadDraft } from './drafts'
import { createList } from './lists'

// The pre-carousel single-draft slot (drafts.ts's 'current' key) that this
// migration retires once its content has been folded into a document-mode
// list.
const DRAFT_STORE = 'drafts'
const DRAFT_KEY = 'current'

// One-time upgrade from the old "single autosaved draft" model to the new
// "carousel of documents" model — call this once at app startup, before
// reading the active list. Idempotent: once an active list id exists, every
// later call is a no-op.
//
// - If an active list is already set, does nothing and resolves to null
//   (already migrated, or a fresh install that started directly on the new
//   model).
// - If no active list is set and a non-empty legacy draft exists, folds it
//   into a brand-new list (createList), makes that list the active one, then
//   deletes the legacy draft slot so it can't be migrated again — and
//   resolves to the new list's id. This is what protects a user's in-progress
//   edit (see history #10/#12) from being silently lost by the model switch.
// - If no active list is set and the legacy draft is missing/empty, just
//   clears the (empty/absent) legacy slot and resolves to null — there's
//   nothing worth preserving.
export async function migrateLegacyDraft(): Promise<string | null> {
  const activeListId = await getActiveListId()
  if (activeListId !== null) return null

  const pairs = await loadDraft()
  if (pairs === null || pairs.length === 0) {
    await idbDel(DRAFT_STORE, DRAFT_KEY)
    return null
  }

  const list = await createList(pairs)
  await setActiveListId(list.id)
  await idbDel(DRAFT_STORE, DRAFT_KEY)
  return list.id
}
