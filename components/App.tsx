'use client'

import { createEffect, createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'
import { PrintSheets } from './PrintSheets'
import { WordTable } from './WordTable'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import { historyItemTitle, messages, pageMeterCaption } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { computePageFill } from '../src/lib/pageMeter'
import { adjustIndexAfterRemoval, buildListPath, parseListIdFromPath, shouldConfirmBeforeNewList } from '../src/lib/carousel'
import { getActiveListId, setActiveListId } from '../src/lib/storage/active'
import { generateId } from '../src/lib/storage/id'
import { MAX_LISTS, clearAllLists, createList, deleteList, getList, listSaved, updateList } from '../src/lib/storage/lists'
import { migrateLegacyDraft } from '../src/lib/storage/migrate'
import { LIST_VERSION, type SavedList } from '../src/lib/storage/schema'
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
// carousel card: a real id and createdAt are assigned immediately (fixing
// its position and its /l/{id} URL), but it is never written to
// IndexedDB until it holds its first non-empty pair — see createList's
// `overrides` param and doPersist below.
function emptyCard(): SavedList {
  const now = Date.now()
  return { v: LIST_VERSION, id: generateId(), pairs: [], createdAt: now, updatedAt: now }
}

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [locale, setLocale] = createSignal<Locale>((props.locale as Locale) ?? 'ja')

  // The carousel: every saved (or not-yet-saved) list, oldest first, fixed
  // in that order regardless of editing — see docs on `navigate`/
  // `createNewList` below for how the order is maintained. `activeIndex`
  // is which of them the center card is currently showing/editing.
  //
  // Both start as the "nothing loaded yet" state so the very first client
  // render matches what the server rendered (no lists fetched during SSR) —
  // onMount below replaces them once IndexedDB has been read, avoiding a
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

  const activeList = createMemo(() => lists()[activeIndex()] ?? null)
  const prevList = createMemo(() => lists()[activeIndex() - 1] ?? null)
  const nextList = createMemo(() => lists()[activeIndex() + 1] ?? null)

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
  let pending = null as { id: string; pairs: Pair[]; createdAt: number } | null

  // Writes one list's pairs to IndexedDB: an update if it's already there,
  // or its first real creation (pinned to the id/createdAt it was already
  // assigned in memory — see emptyCard/createList's `overrides`) if not. A
  // no-op for an empty `pairs` — an empty list is never written; it either
  // gets its first real content here later, or evaporates (see
  // commitActiveEdits) without ever touching IndexedDB.
  const doPersist = async (p: { id: string; pairs: Pair[]; createdAt: number }) => {
    if (p.pairs.length === 0) return
    const existing = await getList(p.id)
    if (existing) {
      await updateList(p.id, p.pairs)
    } else {
      await createList(p.pairs, { id: p.id, createdAt: p.createdAt })
    }
  }

  const cancelPendingSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    pending = null
  }

  // Flushes a *pending* save immediately. Guarded on saveTimer !== null so a
  // pagehide/hidden firing with nothing scheduled (e.g. right after
  // switching cards) can't re-write a card with data it already has.
  const flushSave = () => {
    if (saveTimer === null) return
    const p = pending
    cancelPendingSave()
    if (p) void doPersist(p)
  }

  const scheduleSave = (id: string, pairsToSave: Pair[], createdAt: number) => {
    pending = { id, pairs: pairsToSave, createdAt }
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
    setPairs(newPairs)
    const current = activeList()
    if (!current) return
    setLists(lists().map((l) => (l.id === current.id ? { ...l, pairs: newPairs } : l)))
    scheduleSave(current.id, newPairs, current.createdAt)
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
      void deleteList(current.id) // no-op if it was never written
      return synced.filter((l) => l.id !== current.id)
    }

    void doPersist({ id: current.id, pairs: currentPairs, createdAt: current.createdAt })
    return synced
  }

  // Points the carousel at `next`: updates the active-list pointer, the
  // URL, and pushes its pairs into WordTable. Does not touch `lists`/
  // `activeIndex` — callers set those first, since where `next` sits in
  // the array differs per caller (paging vs. a freshly appended card).
  const openList = (next: SavedList) => {
    void setActiveListId(next.id)
    history.replaceState(null, '', buildListPath(next.id))
    setLoadRequest({ pairs: next.pairs, nonce: ++loadNonce })
  }

  const focusCenterInput = () => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.carousel-slot-center .word-table input')?.focus()
    })
  }

  // Pages to `toIndex` (a prev/next preview click). Steps: settle the card
  // being left (commitActiveEdits), correct `toIndex` if that card
  // evaporated out from under it, clamp into bounds (recreating a single
  // empty card if the carousel would otherwise be left with none), then
  // switch.
  const navigate = (toIndex: number) => {
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
    focusCenterInput()
  }

  // Appends a fresh empty card and switches to it — the "+ New" ghost card
  // and the header's New button both call this.
  //
  // Invariant this relies on: `lists().length` never exceeds MAX_LISTS,
  // because this is the *only* place a card is ever added, and it always
  // evicts down to under the cap first. That means the eviction check
  // below (post-commit) can only ever trigger at exactly `=== MAX_LISTS`,
  // never above it — so commitActiveEdits shrinking the array by one
  // (evaporating an empty current card) can never itself land back on the
  // cap and prompt a confirm the user didn't expect.
  const createNewList = () => {
    let ls = commitActiveEdits()
    setLists(ls)

    if (shouldConfirmBeforeNewList(ls.length, MAX_LISTS)) {
      if (!window.confirm(t().confirmEvictOldest)) return
      const oldest = ls[0]
      void deleteList(oldest.id)
      ls = ls.slice(1)
    }

    const fresh = emptyCard()
    ls = [...ls, fresh]
    setLists(ls)
    setActiveIndex(ls.length - 1)
    openList(fresh)
    focusCenterInput()
  }

  // Deletes the currently active card outright (its own header button) —
  // distinct from navigate's "empty cards evaporate" behavior, this
  // removes the card unconditionally, whatever it contains. Moves to the
  // next (newer) card if there is one, else the previous (older) one, else
  // creates a fresh empty card.
  const deleteCurrentList = () => {
    cancelPendingSave()

    const current = activeList()
    if (!current) return
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
    focusCenterInput()
  }

  // "Clear all history" (moved into the info popover — see render below).
  // Wipes every saved list and leaves the carousel with a single fresh
  // empty card, since there is nothing left to show.
  const handleClearAllLists = async () => {
    cancelPendingSave()
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
  // 2. Load every saved list, oldest first (the carousel's fixed order).
  // 3. Pick which one is active: the URL's /l/{id} if it names a real
  //    list, else the last-active pointer, else the most recent, else (no
  //    lists at all) a fresh empty in-memory card.
  // 4. Point the carousel and WordTable at it, and fix the URL to match.
  const initialize = async () => {
    await migrateLegacyDraft()

    const saved = await listSaved()
    const asc = [...saved].sort((a, b) => a.createdAt - b.createdAt)

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
    const flushOnHide = () => flushSave()
    const flushOnVisibilityChange = () => {
      if (document.hidden) flushSave()
    }
    window.addEventListener('pagehide', flushOnHide)
    document.addEventListener('visibilitychange', flushOnVisibilityChange)

    onCleanup(() => {
      window.removeEventListener('pagehide', flushOnHide)
      document.removeEventListener('visibilitychange', flushOnVisibilityChange)
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
      <header className="app-header no-print">
        <h1>Sora</h1>
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
        <button type="button" className="new-button" onClick={createNewList}>
          {t().newList}
        </button>
        <button type="button" className="info-button" aria-label={t().infoLabel} {...popoverTrigger}>
          <span aria-hidden="true">ⓘ</span>
        </button>
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
      <div className="carousel no-print">
        <div className="carousel-slot carousel-slot-side">
          {prevList() ? (
            <button
              type="button"
              className="carousel-preview"
              aria-label={t().prevListLabel}
              onClick={() => navigate(activeIndex() - 1)}
            >
              <span className="carousel-preview-title">
                {historyItemTitle(locale(), prevList()!.pairs, prevList()!.createdAt)}
              </span>
              <table className="carousel-preview-table">
                <tbody>
                  {prevList()!.pairs.slice(0, 5).map((pair, i) => (
                    <tr key={i}>
                      <td>{pair.front}</td>
                      <td>{pair.back}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </button>
          ) : (
            <p className="carousel-placeholder">{t().noPrevList}</p>
          )}
        </div>

        <div className="carousel-slot carousel-slot-center">
          <div className="center-card-header">
            <span className="center-card-title">
              {activeList() ? historyItemTitle(locale(), activeList()!.pairs, activeList()!.createdAt) : ''}
            </span>
            <button type="button" className="center-card-delete" onClick={deleteCurrentList}>
              {t().deleteThisList}
            </button>
          </div>
          <WordTable breakIndices={breakIndices()} onChange={handleTableChange} locale={locale()} loadRequest={loadRequest()} />
          {pairs().length === 0 ? (
            <p className="hint">{t().hint}</p>
          ) : (
            <div className="page-meter">
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
            className="print-button"
            disabled={layout().pages.length === 0}
            onClick={() => window.print()}
          >
            {t().print}
          </button>
          <p className="carousel-position">
            {activeIndex() + 1} / {Math.max(lists().length, 1)}
          </p>
          <details className="howto no-print">
            <summary>{t().howTo}</summary>
            <video src="/howto.webm" controls muted loop />
          </details>
        </div>

        <div className="carousel-slot carousel-slot-side">
          {nextList() ? (
            <button
              type="button"
              className="carousel-preview"
              aria-label={t().nextListLabel}
              onClick={() => navigate(activeIndex() + 1)}
            >
              <span className="carousel-preview-title">
                {historyItemTitle(locale(), nextList()!.pairs, nextList()!.createdAt)}
              </span>
              <table className="carousel-preview-table">
                <tbody>
                  {nextList()!.pairs.slice(0, 5).map((pair, i) => (
                    <tr key={i}>
                      <td>{pair.front}</td>
                      <td>{pair.back}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </button>
          ) : (
            <button type="button" className="carousel-new-ghost" aria-label={t().newList} onClick={createNewList}>
              <span className="carousel-new-ghost-plus" aria-hidden="true">+</span>
              <span>{t().newList}</span>
            </button>
          )}
        </div>
      </div>
      <PrintSheets layout={layout()} settings={DEFAULTS} />
    </div>
  )
}
