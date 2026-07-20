'use client'

import { createMemo, createSignal } from '@barefootjs/client'
import type { Messages } from './i18n'
import { adjustIndexAfterRemoval, buildListPath, parseListIdFromPath, shouldConfirmBeforeNewList } from './listnav'
import { getActiveListId, setActiveListId } from './storage/active'
import { generateId } from './storage/id'
import {
  MAX_LISTS,
  clearAllLists,
  createList,
  deleteList,
  getList,
  listSaved,
  putListDirect,
  renameList,
  updateList,
} from './storage/lists'
import { migrateLegacyDraft } from './storage/migrate'
import { LIST_VERSION, normalizeTitle, serializeList, type SavedList } from './storage/schema'
import { SAMPLE_PAIRS, SAMPLE_TITLE } from './sampleList'
import type { Pair } from './types'

/**
 * The list-CRUD + debounced-autosave state machine extracted from App.tsx
 * (piconic-ai/barefootjs#2325 + #2332 made this possible — a same-file
 * factory couldn't hold a store this size, and until #2332's fix, a
 * cross-file factory referencing any of storage/lists.ts's exports
 * triggered a spurious BF112).
 *
 * `pairs`/`t`/`closeMenus`/`setSidebarOpen`/`isNarrowViewport` are App.tsx's
 * own reactive state/helpers — genuinely cross-cutting (editor content,
 * locale messages, sidebar UI), so they're threaded through as parameters
 * rather than duplicated here.
 */
export function useListStore(
  pairs: () => Pair[],
  t: () => Messages,
  closeMenus: () => void,
  setSidebarOpen: (open: boolean) => void,
  isNarrowViewport: () => boolean,
) {
  // How long to wait after the last keystroke before writing to IndexedDB —
  // long enough that a burst of typing coalesces into one write, short
  // enough that pagehide/visibilitychange (see flushSave below) rarely has
  // to do the job instead. Local to the factory (not module-scope): a
  // cross-file factory can only inline references to its own params/locals
  // or re-provisionable imports, never a plain module-level const (#2332).
  const SAVE_DEBOUNCE_MS = 500

  // Builds the in-memory-only placeholder for a brand-new, still-empty
  // list: a real id and createdAt are assigned immediately (fixing its
  // creation-order position and its /l/{id} URL), but it is never written to
  // IndexedDB until it holds its first non-empty pair — see createList's
  // `overrides` param and doPersist below.
  function emptyCard(): SavedList {
    const now = Date.now()
    return { v: LIST_VERSION, id: generateId(), pairs: [], createdAt: now, updatedAt: now }
  }

  // Every saved (or not-yet-saved) list, held in creation order (oldest
  // first) and fixed in that order regardless of editing — see docs on
  // `navigate`/`createNewList` below for how the order is maintained.
  // `activeIndex` is which of them the editor is currently showing/editing.
  //
  // Both start as the "nothing loaded yet" state so the very first client
  // render matches what the server rendered (no lists fetched during SSR) —
  // App's onMount replaces them once IndexedDB has been read, avoiding a
  // hydration mismatch.
  const [lists, setLists] = createSignal<SavedList[]>([])
  const [activeIndex, setActiveIndex] = createSignal(0)

  // Imperative "load this / clear to this" instruction forwarded to
  // WordTable — see WordTableProps.loadRequest for why it carries a
  // monotonic `nonce` rather than being applied from the payload alone.
  // `loadNonce` is a plain module-scoped-per-instance counter (not a
  // signal): nothing ever reads it reactively, it only needs to keep
  // incrementing across calls.
  const [loadRequest, setLoadRequest] = createSignal<{ pairs: Pair[]; nonce: number } | null>(null)
  let loadNonce = 0

  // Tombstones for lists deleted this session (explicit delete, clear-all, or
  // an empty card evaporating). A debounced save can already be in flight —
  // past its getList()/existence check but not yet written — when a delete
  // commits; without this guard its trailing create would resurrect the
  // just-deleted record. doPersist's create path and the flush direct-put
  // both bail on a tombstoned id. Session-scoped: ids are random and never
  // reused, so the set never needs pruning within a page's lifetime.
  const deletedIds = new Set<string>()

  // Set once the user has typed or clicked "New" — read by initialize() to
  // avoid clobbering input made during the async startup window (IndexedDB
  // reads resolve a few frames after mount; anything typed in between must
  // survive rather than be overwritten by the loaded active list).
  let userInteracted = false

  const activeList = createMemo(() => lists()[activeIndex()] ?? null)

  // ---- Autosave -----------------------------------------------------
  //
  // Debounced so rapid keystrokes coalesce into one IndexedDB write.
  // `pending` + `flushSave` let pagehide/visibilitychange save the most
  // recent value immediately, bypassing the timer, when the page is about
  // to go away. Every card-switching action (navigate / createNewList /
  // deleteCurrentList) goes through `commitActiveEdits`, which cancels the
  // timer and settles the card being left synchronously (in the `lists`
  // signal) before anything else touches IndexedDB or the URL — this is
  // what keeps a fast double-click from racing a stale debounced write
  // against the switch.
  let saveTimer = null as ReturnType<typeof setTimeout> | null
  let pending = null as { id: string; pairs: Pair[]; createdAt: number; title?: string } | null

  // The debounced-save writer. Empty pairs are a deletion, not a skip: if the
  // user clears a list down to nothing while staying on the card, its stored
  // record must go away too (deleteList is a harmless no-op when the record
  // was never written), mirroring the "empty card evaporates" rule so a
  // cleared list can't come back on reload. Non-empty: an in-place update if
  // the record exists, else its first real creation — pinned to the id/
  // createdAt already assigned in memory (see emptyCard/createList's
  // `overrides`). The create path bails on a tombstoned id so a save that
  // raced a delete can't resurrect the record.
  const doPersist = async (p: { id: string; pairs: Pair[]; createdAt: number; title?: string }) => {
    if (p.pairs.length === 0) {
      await deleteList(p.id)
      return
    }
    const existing = await getList(p.id)
    if (existing) {
      // updateList preserves the stored title itself; the create path (first
      // real write of a still-memory-only card) must carry the in-memory title
      // through, or a name set before the card was ever persisted is lost.
      await updateList(p.id, p.pairs)
    } else {
      if (deletedIds.has(p.id)) return
      await createList(p.pairs, { id: p.id, createdAt: p.createdAt, title: p.title })
    }
  }

  const cancelPendingSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    pending = null
  }

  // Flushes a *pending* save immediately, for pagehide/visibilitychange when
  // the tab is about to go away. Guarded on saveTimer !== null so a hide with
  // nothing scheduled can't re-write a card. Unlike the debounced path this
  // writes in a *single* IndexedDB transaction (putListDirect) rather than a
  // read-then-write, so the last edit is durable before the page unloads
  // instead of losing the race with it. Empty pending is still a delete, and
  // a tombstoned id is skipped, both consistent with doPersist.
  const flushSave = () => {
    if (saveTimer === null) return
    const p = pending
    cancelPendingSave()
    if (!p) return
    if (p.pairs.length === 0) {
      void deleteList(p.id)
      return
    }
    if (deletedIds.has(p.id)) return
    void putListDirect(serializeList(p.id, p.pairs, p.createdAt, Date.now(), p.title))
  }

  const scheduleSave = (id: string, pairsToSave: Pair[], createdAt: number, title?: string) => {
    pending = { id, pairs: pairsToSave, createdAt, title }
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const p = pending
      cancelPendingSave()
      if (p) void doPersist(p)
    }, SAVE_DEBOUNCE_MS)
  }

  // ---- Leaving the current card --------------------------------------
  //
  // Shared by navigate/createNewList/deleteCurrentList: folds the live
  // editor content into `lists`, then either persists it for real or lets
  // it evaporate if it's empty (never accumulate blank cards). Addressed
  // by id rather than index throughout, so it stays correct regardless of
  // any index-shifting eviction a caller does before/after calling this.
  const commitActiveEdits = (): SavedList[] => {
    cancelPendingSave()

    const current = activeList()
    if (!current) return lists()

    const currentPairs = pairs()
    const synced = lists().map((l) => (l.id === current.id ? { ...l, pairs: currentPairs } : l))

    if (currentPairs.length === 0) {
      deletedIds.add(current.id) // an evaporated empty card must never be resurrected by a racing save
      void deleteList(current.id) // no-op if it was never written
      return synced.filter((l) => l.id !== current.id)
    }

    void doPersist({ id: current.id, pairs: currentPairs, createdAt: current.createdAt, title: current.title })
    return synced
  }

  // Points the editor at `next`: updates the active-list pointer, the URL,
  // and pushes its pairs into WordTable. Does not touch `lists`/`activeIndex`
  // — callers set those first, since where `next` sits in the array differs
  // per caller (selecting an existing list vs. a freshly appended one).
  const openList = (next: SavedList) => {
    void setActiveListId(next.id)
    history.replaceState(null, '', buildListPath(next.id))
    setLoadRequest({ pairs: next.pairs, nonce: ++loadNonce })
  }

  const focusEditorInput = () => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.editor-main .word-table input')?.focus()
    })
  }

  // Switches the editor to the list at `toIndex` (a sidebar item click, via
  // selectList). Steps: settle the list being left (commitActiveEdits),
  // correct `toIndex` if that list evaporated out from under it (empty and
  // unsaved), clamp into bounds (recreating a single empty list if none
  // remain), then switch.
  const navigate = (toIndex: number) => {
    closeMenus()
    const fromIndex = activeIndex()
    const fromId = activeList()?.id ?? null

    let ls = commitActiveEdits()
    let target = toIndex

    if (fromId !== null && !ls.some((l) => l.id === fromId)) {
      target = adjustIndexAfterRemoval(fromIndex, target)
    }

    if (ls.length === 0) {
      ls = [emptyCard()]
      target = 0
    } else {
      target = Math.max(0, Math.min(target, ls.length - 1))
    }

    setLists(ls)
    setActiveIndex(target)
    openList(ls[target])
    focusEditorInput()
  }

  // The sidebar's New button calls this.
  //
  // Invariant this relies on: `lists().length` never exceeds MAX_LISTS,
  // because this is the *only* place a card is ever added, and it always
  // evicts down to under the cap first. That means the eviction check
  // below (post-commit) can only ever trigger at exactly `=== MAX_LISTS`,
  // never above it — so commitActiveEdits shrinking the array by one
  // (evaporating an empty current card) can never itself land back on the
  // cap and prompt a confirm the user didn't expect.
  const createNewList = () => {
    closeMenus()
    userInteracted = true
    let ls = commitActiveEdits()
    setLists(ls)

    if (shouldConfirmBeforeNewList(ls.length, MAX_LISTS)) {
      if (!window.confirm(t().confirmEvictOldest)) {
        // Cancelled — but commitActiveEdits may have evaporated the current
        // (empty) card, leaving activeIndex past the end of `ls`. Re-anchor
        // onto a valid card so activeList() never goes null (which would
        // blank the title and drop autosave). Recreate one if none remain.
        if (ls.length === 0) {
          const fresh = emptyCard()
          setLists([fresh])
          setActiveIndex(0)
          openList(fresh)
        } else {
          const clamped = Math.min(activeIndex(), ls.length - 1)
          setActiveIndex(clamped)
          openList(ls[clamped])
        }
        return
      }
      const oldest = ls[0]
      deletedIds.add(oldest.id)
      void deleteList(oldest.id)
      ls = ls.slice(1)
    }

    const fresh = emptyCard()
    ls = [...ls, fresh]
    setLists(ls)
    setActiveIndex(ls.length - 1)
    openList(fresh)
    // Close the narrow-viewport drawer before focusing, so the editor (and the
    // software keyboard it summons) isn't left behind the open drawer + scrim.
    if (isNarrowViewport()) setSidebarOpen(false)
    focusEditorInput()
  }

  // Selects the list with `id` from the sidebar. Resolves it to its index in
  // the creation-ordered `lists` (the sidebar shows a newest-first *view*, so
  // the clicked id must be looked up, not used positionally) and hands off to
  // navigate, which commits the list being left (evaporating it if empty) and
  // opens the target.
  const selectList = (id: string) => {
    // On a narrow viewport the sidebar is an overlay drawer (see the
    // sidebar-closed CSS) — picking a list should return focus to the
    // editor, not leave the drawer covering it. Done even when tapping the
    // already-active item (a common "go back to the editor" gesture), so it
    // runs before the same-id early return below.
    if (isNarrowViewport()) setSidebarOpen(false)
    if (id === activeList()?.id) {
      closeMenus()
      return
    }
    const idx = lists().findIndex((l) => l.id === id)
    if (idx < 0) return
    navigate(idx)
  }

  // Deletes a specific list from the sidebar's per-item ✕. If it's the active
  // one, defer to deleteCurrentList (which moves the editor to a neighbour).
  // Otherwise remove it without disturbing the editor: drop it from `lists`,
  // tombstone + delete it, and shift activeIndex left if the removed item sat
  // before the active one so the same list stays active.
  const deleteListById = (id: string) => {
    closeMenus()
    const current = activeList()
    if (id === current?.id) {
      deleteCurrentList()
      return
    }
    const removeIndex = lists().findIndex((l) => l.id === id)
    if (removeIndex < 0) return
    if (!window.confirm(t().confirmDeleteThisList)) return

    deletedIds.add(id)
    void deleteList(id)

    const ls = lists().filter((_, i) => i !== removeIndex)
    setLists(ls)
    if (removeIndex < activeIndex()) setActiveIndex(activeIndex() - 1)
  }

  // Deletes the currently active list outright. Distinct from navigate's
  // "empty lists evaporate" behavior, this removes the list unconditionally,
  // whatever it contains, then moves the editor to the next (newer) list if
  // there is one, else the previous (older) one, else a fresh empty list.
  const deleteCurrentList = () => {
    closeMenus()
    const current = activeList()
    if (!current) return
    // Confirm only when there's content to lose — deleting an untouched empty
    // card is harmless and shouldn't nag. A populated list can hold dozens of
    // irreversible pairs, so that one asks first.
    if (current.pairs.length > 0 && !window.confirm(t().confirmDeleteThisList)) return

    cancelPendingSave()
    deletedIds.add(current.id)
    void deleteList(current.id)

    const idx = activeIndex()
    let ls = lists().filter((_, i) => i !== idx)
    let target: number

    if (ls.length === 0) {
      ls = [emptyCard()]
      target = 0
    } else if (idx < ls.length) {
      target = idx // the card that was "next" (newer) now sits here
    } else {
      target = ls.length - 1 // there was no "next" — fall back to the new last (older) one
    }

    setLists(ls)
    setActiveIndex(target)
    openList(ls[target])
    focusEditorInput()
  }

  // Commits (or clears) a rename's *data* effect: writes the new title into
  // `lists`, keeps any in-flight debounced save's title in sync so it can't
  // overwrite the new name when it lands, and persists it for a real
  // (already-written) record. App.tsx's `commitRename` wraps this with the
  // renamingId()-focused UI check (idempotent across the Enter-then-blur and
  // Escape-then-blur sequences) before calling in.
  const persistRename = (id: string, rawValue: string) => {
    const title = normalizeTitle(rawValue)
    setLists(lists().map((l) => (l.id === id ? { ...l, title } : l)))
    if (pending && pending.id === id) pending.title = title

    // Persist only real records; a still-memory-only card (getList === null)
    // carries the title into its first write via pending/doPersist's create
    // path. Tombstoned ids are never written back.
    if (deletedIds.has(id)) return
    void (async () => {
      const existing = await getList(id)
      if (existing) await renameList(id, rawValue)
    })()
  }

  // "Clear all history" (lives in the info popover — see App.tsx's render).
  // Wipes every saved list and reseeds the "Sample" list, same as a
  // first-ever visit — never leave the sidebar with nothing to open.
  const handleClearAllLists = async () => {
    closeMenus()
    // Destructive and irreversible (every list, not just the current one), so
    // confirm — mirroring the per-item delete.
    if (!window.confirm(t().confirmClearAll)) return
    cancelPendingSave()
    // Tombstone every id so any save that was already in flight when the wipe
    // lands can't recreate a record clearAllLists just removed.
    for (const l of lists()) deletedIds.add(l.id)
    await clearAllLists()
    const fresh = await createList(SAMPLE_PAIRS, { title: SAMPLE_TITLE })
    setLists([fresh])
    setActiveIndex(0)
    openList(fresh)
  }

  // ---- Startup ---------------------------------------------------------
  //
  // 1. Fold any pre-carousel legacy draft into a list (idempotent, no-op
  //    after the first run).
  // 2. Load every saved list, oldest first (the creation order `lists` holds).
  // 3. Pick which one is active: the URL's /l/{id} if it names a real
  //    list, else the last-active pointer, else the most recent, else (no
  //    lists at all) a fresh empty in-memory list.
  // 4. Point the sidebar/editor at it, and fix the URL to match.
  const initialize = async () => {
    await migrateLegacyDraft()

    let saved = await listSaved()
    // First-ever visit, or right after "clear all history": seed a titled
    // "Sample" list so there's something to open/print instead of a blank
    // table. Skipped if the user already started typing during this async
    // window (userInteracted, checked below) — their in-progress content
    // takes priority over an unrequested sample.
    if (saved.length === 0 && !userInteracted) {
      const sample = await createList(SAMPLE_PAIRS, { title: SAMPLE_TITLE })
      saved = [sample]
    }
    const asc = [...saved].sort((a, b) => a.createdAt - b.createdAt)

    // The user typed or clicked "New" during the async startup window. Their
    // in-progress input lives in pairs() (and possibly a memory-only card),
    // but nothing they did was persisted yet. Rather than clobber it with the
    // loaded active list, fold it in as a fresh newest card and leave the
    // editor untouched (no loadRequest). Everything below this line runs
    // synchronously, so `userInteracted` can't flip again mid-merge.
    if (userInteracted) {
      const now = Date.now()
      const fresh: SavedList = { v: LIST_VERSION, id: generateId(), pairs: pairs(), createdAt: now, updatedAt: now }
      const merged = [...asc, fresh]
      setLists(merged)
      setActiveIndex(merged.length - 1)
      void setActiveListId(fresh.id)
      history.replaceState(null, '', buildListPath(fresh.id))
      if (fresh.pairs.length > 0) scheduleSave(fresh.id, fresh.pairs, fresh.createdAt)
      return
    }

    const urlId = parseListIdFromPath(location.pathname)
    const storedActiveId = await getActiveListId()

    let index = urlId ? asc.findIndex((l) => l.id === urlId) : -1
    if (index === -1 && storedActiveId) index = asc.findIndex((l) => l.id === storedActiveId)
    if (index === -1 && asc.length > 0) index = asc.length - 1

    const ls = index === -1 ? [emptyCard()] : asc
    if (index === -1) index = 0

    setLists(ls)
    setActiveIndex(index)
    openList(ls[index])
  }

  const markUserInteracted = () => {
    userInteracted = true
  }

  return {
    lists,
    setLists,
    activeIndex,
    activeList,
    loadRequest,
    scheduleSave,
    cancelPendingSave,
    flushSave,
    commitActiveEdits,
    openList,
    navigate,
    createNewList,
    selectList,
    deleteListById,
    deleteCurrentList,
    handleClearAllLists,
    persistRename,
    initialize,
    markUserInteracted,
  }
}
