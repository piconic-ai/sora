'use client'

import { createEffect, createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'
import { PrintSheets } from './PrintSheets'
import { WordTable } from './WordTable'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import { displayListTitle, historyItemTitle, messages, pageMeterCaption } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { computePageFill } from '../src/lib/pageMeter'
import { adjustIndexAfterRemoval, buildListPath, parseListIdFromPath, shouldConfirmBeforeNewList } from '../src/lib/listnav'
import { getActiveListId, setActiveListId } from '../src/lib/storage/active'
import { generateId } from '../src/lib/storage/id'
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
} from '../src/lib/storage/lists'
import { migrateLegacyDraft } from '../src/lib/storage/migrate'
import { LIST_VERSION, normalizeTitle, serializeList, type SavedList } from '../src/lib/storage/schema'
import type { Pair } from '../src/lib/types'

interface AppProps {
  locale: string
}

// The Popover API attributes (`popover`, `popovertarget`) are standard HTML
// but are not yet in @barefootjs/jsx's attribute types. Spreading them from a
// plain record keeps the JSX type-checking. These must be const object
// literals (not a function call) so the compiler folds them into both the
// SSR and client templates as static attributes; a function-call spread is
// left dynamic and drops out of the client template.
const popoverTarget: Record<string, string> = { popover: 'auto' }
const popoverTrigger: Record<string, string> = { popovertarget: 'sora-info' }

// How long to wait after the last keystroke before writing to IndexedDB —
// long enough that a burst of typing coalesces into one write, short enough
// that pagehide/visibilitychange (see flushSave below) rarely has to do the
// job instead.
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

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [locale, setLocale] = createSignal<Locale>((props.locale as Locale) ?? 'ja')

  // Every saved (or not-yet-saved) list, held in creation order (oldest
  // first) and fixed in that order regardless of editing — see docs on
  // `navigate`/`createNewList` below for how the order is maintained.
  // `activeIndex` is which of them the editor is currently showing/editing.
  // (The sidebar renders a newest-first *view* of this; see sidebarLists.)
  //
  // Both start as the "nothing loaded yet" state so the very first client
  // render matches what the server rendered (no lists fetched during SSR) —
  // onMount below replaces them once IndexedDB has been read, avoiding a
  // hydration mismatch.
  const [lists, setLists] = createSignal<SavedList[]>([])
  const [activeIndex, setActiveIndex] = createSignal(0)

  // Whether the list sidebar is shown. Starts `true` on both SSR and the
  // first client render (a wide-viewport assumption, matching what SSR always
  // renders regardless of the real device) so hydration never mismatches;
  // onMount below corrects it to `false` on an actually-narrow viewport
  // (matchMedia is a client-only API, so it can't run before mount). Not
  // persisted — every load re-derives it from the current viewport.
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const isNarrowViewport = () => window.matchMedia('(max-width: 720px)').matches

  // Per-list-item UI state for the sidebar's ⋮ menu and inline rename. Held as
  // the id of the single open menu / list being renamed (or null). Folded into
  // the `sidebarLists` memo below (alongside `active`) so the render stays a
  // single-level `.map()` — see #2218 in the memory notes. Never persisted:
  // both reset on any card-switching/mutating action and on outside click/ESC.
  const [menuOpenId, setMenuOpenId] = createSignal<string | null>(null)
  const [renamingId, setRenamingId] = createSignal<string | null>(null)

  const closeMenus = () => {
    setMenuOpenId(null)
    setRenamingId(null)
  }

  // The ⋮ dropdown is position:fixed (so it escapes the sidebar's overflow
  // clipping — see .list-item-menu in app.css), so JS has to place it under
  // its button. Runs after the render that applies `is-open`, reads the
  // button's viewport rect, and pins the menu just below it, right-aligned but
  // clamped to stay on-screen.
  const positionMenu = () => {
    requestAnimationFrame(() => {
      const menu = document.querySelector<HTMLElement>('.list-item-menu.is-open')
      const btn = menu?.previousElementSibling as HTMLElement | null
      if (!menu || !btn) return
      const r = btn.getBoundingClientRect()
      const menuH = menu.offsetHeight
      // Prefer just below the button; flip above it when the dropdown would
      // spill past the viewport bottom (the lowest sidebar rows), then clamp.
      let top = r.bottom + 2
      if (top + menuH > window.innerHeight - 8) top = r.top - menuH - 2
      top = Math.max(8, top)
      menu.style.top = `${Math.round(top)}px`
      menu.style.left = `${Math.round(Math.max(8, r.right - menu.offsetWidth))}px`
    })
  }

  const toggleMenu = (id: string) => {
    if (menuOpenId() === id) {
      setMenuOpenId(null)
      return
    }
    setRenamingId(null) // never leave a rename open on another row
    setMenuOpenId(id)
    positionMenu()
  }

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

  // The sidebar's view of `lists`. `lists` is held in creation order (oldest
  // first) — the order the state machine relies on for index math — but the
  // sidebar shows it newest-first, so a freshly created list appears at the
  // top, directly under the New button. Each entry carries a precomputed
  // `active` flag and the memo reads activeList(), so switching the active
  // list (which doesn't change `lists` itself) still recomputes and moves the
  // highlight — keeping the reactive work to a single-level `.map()` in the
  // render (nested/index-keyed loops are avoided; see barefoot #2218).
  const sidebarLists = createMemo(() => {
    const activeId = activeList()?.id ?? null
    const menuId = menuOpenId()
    const renameId = renamingId()
    return [...lists()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({
        item,
        active: item.id === activeId,
        menuOpen: item.id === menuId,
        renaming: item.id === renameId,
      }))
  })

  const layout = createMemo(() => computeLayout(pairs(), DEFAULTS))
  const pageFill = createMemo(() => computePageFill(pairs().length, layout().capacity.pairsPerPage))
  // Every element of pageBreakAfterPairIndex marks the last pair of a
  // page, including the very last pair overall — but there's no line to
  // draw after the final row, so that last entry is dropped.
  const breakIndices = createMemo(() => {
    const all = layout().pageBreakAfterPairIndex
    return all.length > 1 ? all.slice(0, -1) : []
  })

  const t = createMemo(() => messages[locale()])

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

  // WordTable's onChange: the live editor content becomes the source of
  // truth for both the `pairs` signal (rendering) and, synced immediately,
  // the active entry inside `lists` (so a preview card / the URL / a
  // concurrent navigate always sees up-to-date content instead of whatever
  // was last persisted).
  const handleTableChange = (newPairs: Pair[]) => {
    userInteracted = true
    setPairs(newPairs)
    const current = activeList()
    if (!current) return
    setLists(lists().map((l) => (l.id === current.id ? { ...l, pairs: newPairs } : l)))
    scheduleSave(current.id, newPairs, current.createdAt, current.title)
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

  // Appends a fresh empty card and switches to it — the sidebar's New button
  // calls this.
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

  // ---- Inline rename (sidebar ⋮ menu → "Rename") ---------------------
  //
  // Opens the inline editor for a list: both the select button and a hidden
  // <input> are always rendered per row (see the sidebar render); flipping
  // `renamingId` toggles which is shown via CSS, so no DOM structure changes
  // inside the reactive `.map()`. The input is *uncontrolled* — its value is
  // seeded here from the current title (or left blank so the placeholder shows
  // the auto-generated name), after the render has applied `is-renaming`.
  const startRename = (id: string) => {
    setMenuOpenId(null)
    setRenamingId(id)
    const list = lists().find((l) => l.id === id)
    const initial = list?.title ?? ''
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>('.list-item.is-renaming .list-item-rename-input')
      if (!input) return
      input.value = initial
      input.focus()
      input.select()
    })
  }

  // Commits (or clears) a rename. The `renamingId() !== id` guard makes this
  // idempotent across the Enter-then-blur and Escape-then-blur sequences:
  // Enter/Escape both null out `renamingId` before the resulting blur fires,
  // so the trailing blur-commit no-ops. An empty value clears the title
  // (normalizeTitle -> undefined), reverting to the auto-generated label.
  const commitRename = (id: string, rawValue: string) => {
    if (renamingId() !== id) return
    setRenamingId(null)

    const title = normalizeTitle(rawValue)
    setLists(lists().map((l) => (l.id === id ? { ...l, title } : l)))
    // Keep any in-flight debounced save's title in sync so it can't overwrite
    // the new name when it lands (create path carries pending.title; the
    // update path preserves the stored title updated below).
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

  const handleRenameKeyDown = (id: string, e: KeyboardEvent) => {
    // Keep Enter/Escape (and every other key) from reaching the document-level
    // menu handlers or the editor — this input owns them while it's focused.
    e.stopPropagation()
    // Never act on the Enter that confirms an IME composition, nor the Escape
    // that cancels one — otherwise typing a Japanese list name would commit
    // half-converted text or discard the rename mid-composition (same guard as
    // WordTable's editor; see its handleKeyDown).
    if (e.isComposing || (e as { keyCode?: number }).keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename(id, (e.target as HTMLInputElement).value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setRenamingId(null) // cancel — the ensuing blur-commit no-ops (see commitRename's guard)
    }
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

  // "Clear all history" (lives in the info popover — see render below).
  // Wipes every saved list and leaves a single fresh empty list, since there
  // is nothing left to show.
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
    const fresh = emptyCard()
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

    const saved = await listSaved()
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

  onMount(() => {
    // Mark that client JS is live. The narrow-viewport CSS keeps the drawer +
    // scrim hidden until this class is present, so a phone-width first paint
    // doesn't flash an open drawer over a dark scrim before hydration corrects
    // sidebarOpen to false below. Set on <html> (outside the island) so it
    // doesn't perturb hydration reconciliation.
    document.documentElement.classList.add('js-ready')
    if (isNarrowViewport()) setSidebarOpen(false)

    const flushOnHide = () => flushSave()
    const flushOnVisibilityChange = () => {
      if (document.hidden) flushSave()
    }
    window.addEventListener('pagehide', flushOnHide)
    document.addEventListener('visibilitychange', flushOnVisibilityChange)

    // Dismiss an open ⋮ menu on any click outside its wrapper. Clicks on the
    // menu button or its items live inside `.list-item-menu-wrap`, so they're
    // ignored here and handled by their own onClick instead.
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target?.closest('.list-item-menu-wrap')) return
      setMenuOpenId(null)
    }
    // ESC closes an open menu. While renaming, the input's own keydown handler
    // stops propagation, so this never fires for the rename Escape (which
    // cancels the edit instead).
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenId(null)
    }
    // The open menu is position:fixed and pinned to its button's rect; a scroll
    // (of the list or the page) or a resize moves the button out from under it,
    // so just close it rather than chase the anchor. `capture` so a scroll of
    // the inner `.list-items` container (scroll doesn't bubble) is still seen.
    const onScrollOrResize = () => setMenuOpenId(null)
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onDocKeyDown)
    document.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)

    onCleanup(() => {
      window.removeEventListener('pagehide', flushOnHide)
      document.removeEventListener('visibilitychange', flushOnVisibilityChange)
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onDocKeyDown)
      document.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      cancelPendingSave()
    })

    void initialize()
  })

  // Keeps document.title / html lang in sync with the client-side locale
  // signal (SSR already sets both on first paint; this is what makes them
  // update on a language switch without a full reload) and persists the
  // choice in a cookie so the next SSR request (server.tsx's resolveLocale)
  // picks the same locale.
  createEffect(() => {
    const loc = locale()
    document.title = messages[loc].title
    document.documentElement.lang = loc
    document.cookie = `locale=${loc}; path=/; max-age=31536000; samesite=lax`
  })

  return (
    <div className="app">
      <header className={sidebarOpen() ? 'app-header no-print' : 'app-header no-print logo-hidden'}>
        {/* Mobile-only reopen button (see app.css): on narrow layouts the
            sidebar is an overlay drawer, so the toggle lives in the header
            row instead of the workspace's left column. Same behavior as
            the .sidebar-open--inline button below — only one of the two is
            ever visible, switched by the 720px media query. */}
        {!sidebarOpen() ? (
          <button
            type="button"
            className="sidebar-open sidebar-open--header"
            aria-expanded={sidebarOpen()}
            aria-controls="list-sidebar"
            aria-label={t().sidebarToggleLabel}
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
        ) : null}
        <h1 className="app-title">
          <svg className="app-logo" viewBox="55 48 390 104" xmlns="http://www.w3.org/2000/svg" aria-label="piconic">
            <g fill="#00b769">
              <path d="M136.32,53.25c-3.1,0-5.62,2.49-5.62,5.56,0,3.07,2.52,5.56,5.62,5.56,3.1,0,5.62-2.49,5.62-5.56s-2.52-5.56-5.62-5.56Z" />
              <rect x="132.05" y="75.12" width="8.53" height="49.65" />
              <path d="M371.34,52.88c-3.1,0-5.62,2.49-5.62,5.56s2.52,5.56,5.62,5.56c3.1,0,5.62-2.49,5.62-5.56s-2.52-5.56-5.62-5.56Z" />
              <rect x="367.08" y="75.12" width="8.53" height="49.65" />
              <path d="M248.89,74.52c-14.02,0-25.14,11.41-25.14,25.42s11.12,25.42,25.14,25.42,25.14-11.4,25.14-25.42-11.12-25.42-25.14-25.42ZM248.89,116.28c-9.01,0-16.62-7.33-16.62-16.33s7.61-16.33,16.62-16.33,16.62,7.33,16.62,16.33-7.61,16.33-16.62,16.33Z" />
              <path d="M199.11,111.56c-3.02,2.92-7.14,4.72-11.61,4.72-9.01,0-16.62-7.33-16.62-16.33s7.61-16.33,16.62-16.33c4.47,0,8.59,1.81,11.61,4.72l6.28-6.28c-4.54-4.65-10.85-7.53-17.89-7.53-14.02,0-25.14,11.41-25.14,25.42s11.12,25.42,25.14,25.42c7.05,0,13.36-2.88,17.89-7.53l-6.28-6.28Z" />
              <path d="M434.13,111.56c-3.02,2.92-7.14,4.72-11.61,4.72-9.01,0-16.62-7.33-16.62-16.33s7.61-16.33,16.62-16.33c4.47,0,8.59,1.81,11.61,4.72l6.28-6.28c-4.54-4.65-10.85-7.53-17.89-7.53-14.02,0-25.14,11.41-25.14,25.42s11.12,25.42,25.14,25.42c7.05,0,13.36-2.88,17.89-7.53l-6.28-6.28Z" />
              <path d="M319.49,74.52c-14.02,0-25.14,11.41-25.14,25.42h0v24.83h8.53v-24.83c0-9.01,7.61-16.33,16.62-16.33s16.62,7.33,16.62,16.33v24.83h8.53v-24.83h0c0-14.02-11.12-25.42-25.14-25.42Z" />
              <path d="M85,74.52c-14.02,0-25.14,11.41-25.14,25.42v46.78h8.53v-27.7c4.41,3.93,10.2,6.34,16.62,6.34,14.02,0,25.14-11.4,25.14-25.42s-11.12-25.42-25.14-25.42ZM85,116.28c-9.01,0-16.62-7.33-16.62-16.33s7.61-16.33,16.62-16.33,16.62,7.33,16.62,16.33-7.61,16.33-16.62,16.33Z" />
            </g>
          </svg>
          <span className="app-wordmark">sora</span>
        </h1>
        <p className="app-tagline">{t().tagline}</p>
        <select
          className="lang-select"
          aria-label="Language"
          value={locale()}
          onChange={(e) => setLocale((e.target as HTMLSelectElement).value as Locale)}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
        <button type="button" className="info-button" aria-label={t().infoLabel} {...popoverTrigger}>
          <span aria-hidden="true">i</span>
        </button>
        <a href="/how-to" className="help-button" aria-label={t().howTo}>
          <span aria-hidden="true">?</span>
        </a>
      </header>
      <div id="sora-info" role="note" aria-label={t().infoLabel} className="info-popover no-print" {...popoverTarget}>
        <p className="info-lead">
          <strong>Sora</strong>
          {t().infoLead}
        </p>
        <p className="info-note">{t().infoNote}</p>
        <p className="info-privacy">{t().infoPrivacyNote}</p>
        <button type="button" className="info-clear-all" onClick={() => void handleClearAllLists()}>
          {t().clearAllLists}
        </button>
        <p className="info-built">
          {locale() === 'ja' ? (
            <span>
              <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
              {' と '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener">Barefoot.js</a>
              {' で構築。'}
            </span>
          ) : (
            <span>
              {'Built with '}
              <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
              {' and '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener">Barefoot.js</a>
              {'.'}
            </span>
          )}
        </p>
        <hr />
        <p className="info-contact">
          {t().infoContactIntro}
          <span className="info-contact-links">
            <a href="https://x.com/kfly8" target="_blank" rel="noopener">x.com/kfly8</a>
            <a href="mailto:kentafly88@gmail.com">kentafly88@gmail.com</a>
          </span>
        </p>
      </div>
      <div className={sidebarOpen() ? 'workspace no-print' : 'workspace no-print sidebar-closed'}>
        {/* Reopen button, rendered where the sidebar's own collapse button
            sits while open (workspace top-left) — the two toggles share one
            screen position, so opening and closing never requires moving
            the mouse. */}
        {!sidebarOpen() ? (
          <button
            type="button"
            className="sidebar-open sidebar-open--inline"
            aria-expanded={sidebarOpen()}
            aria-controls="list-sidebar"
            aria-label={t().sidebarToggleLabel}
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
        ) : null}
        {sidebarOpen() && (
          <div className="sidebar-scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        )}
        <aside id="list-sidebar" className="list-sidebar" aria-label={t().listsLabel}>
          <button
            type="button"
            className="sidebar-collapse"
            aria-expanded={sidebarOpen()}
            aria-controls="list-sidebar"
            aria-label={t().sidebarToggleLabel}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
          <button type="button" className="new-button" onClick={createNewList}>
            <span className="new-button-plus" aria-hidden="true">+</span>
            {t().newList}
          </button>
          <div className="list-items" role="list">
            {sidebarLists().map((entry) => (
              <div
                className={
                  entry.renaming
                    ? entry.active
                      ? 'list-item is-active is-renaming'
                      : 'list-item is-renaming'
                    : entry.active
                      ? 'list-item is-active'
                      : 'list-item'
                }
                role="listitem"
                key={entry.item.id}
              >
                <button
                  type="button"
                  className="list-item-select"
                  aria-current={entry.active ? 'true' : undefined}
                  onClick={() => selectList(entry.item.id)}
                >
                  {displayListTitle(locale(), entry.item)}
                </button>
                <input
                  type="text"
                  className="list-item-rename-input"
                  aria-label={t().renameListLabel}
                  placeholder={historyItemTitle(locale(), entry.item.pairs, entry.item.createdAt)}
                  onKeyDown={(e) => handleRenameKeyDown(entry.item.id, e as KeyboardEvent)}
                  onBlur={(e) => commitRename(entry.item.id, (e.target as HTMLInputElement).value)}
                />
                <div className="list-item-menu-wrap">
                  <button
                    type="button"
                    className="list-item-menu-btn"
                    aria-haspopup="menu"
                    aria-expanded={entry.menuOpen}
                    aria-label={t().listItemMenu}
                    onClick={() => toggleMenu(entry.item.id)}
                  >
                    <span aria-hidden="true">⋮</span>
                  </button>
                  <div className={entry.menuOpen ? 'list-item-menu is-open' : 'list-item-menu'} role="menu">
                    <button
                      type="button"
                      className="list-item-menu-item"
                      role="menuitem"
                      onClick={() => startRename(entry.item.id)}
                    >
                      {t().renameListLabel}
                    </button>
                    <button
                      type="button"
                      className="list-item-menu-item is-danger"
                      role="menuitem"
                      onClick={() => deleteListById(entry.item.id)}
                    >
                      {t().deleteThisList}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="editor-main">
          <div className="editor-body">
            <WordTable breakIndices={breakIndices()} onChange={handleTableChange} locale={locale()} loadRequest={loadRequest()} />
            {pairs().length === 0 ? (
              <p className="hint no-print">{t().hint}</p>
            ) : (
              <div className="page-meter no-print">
                <div className="page-meter-track">
                  <div
                    className={pageFill().isFull ? 'page-meter-fill is-full' : 'page-meter-fill'}
                    style={`width:${Math.round(pageFill().ratio * 100)}%`}
                  />
                </div>
                <p className="page-meter-caption">{pageMeterCaption(locale(), pageFill())}</p>
              </div>
            )}
            <button
              type="button"
              className="print-button no-print"
              disabled={layout().pages.length === 0}
              onClick={() => window.print()}
            >
              {t().print}
            </button>
          </div>
        </section>
      </div>
      <PrintSheets layout={layout()} settings={DEFAULTS} />
    </div>
  )
}
