'use client'

import { createEffect, createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'
import { AppHeader } from './AppHeader'
import { EditorMain } from './EditorMain'
import { ListSidebar } from './ListSidebar'
import { PrintSheets } from './PrintSheets'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import { messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { computePageFill } from '../src/lib/pageMeter'
import { useListStore } from '../src/lib/useListStore'
// #2332's import re-provisioning only covers VALUE bindings a factory body
// references (extractFreeIdentifiersFromNode stops at type nodes) — a type
// used only in annotations inside the inlined body, like SavedList here,
// isn't detected or re-provisioned, so it needs its own explicit import at
// the call site.
import type { SavedList } from '../src/lib/storage/schema'
import type { Pair } from '../src/lib/types'

interface AppProps {
  locale: string
}

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [locale, setLocale] = createSignal<Locale>((props.locale as Locale) ?? 'ja')

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

  const t = createMemo(() => messages[locale()])

  // The list-CRUD + debounced-autosave state machine (piconic-ai/sora, see
  // src/lib/useListStore.ts for the full doc comments this used to carry
  // inline) — pairs/t/closeMenus/setSidebarOpen/isNarrowViewport are this
  // component's own reactive state, threaded through since the store can't
  // hold them itself. Destructured (not `const store = ...`) because the
  // compiler's cross-file reactive-factory inlining (#2325/#2332) only
  // recognizes an object-destructure call site — that's what lets `lists`/
  // `activeList` below be seen as ordinary signals/memos post-inlining,
  // exactly as if they were declared directly in this file. A plain
  // `const store = useListStore(...)` would compile, but every signal this
  // store creates would be invisible to the reactivity analysis (no DOM
  // update bindings), since analysis only recognizes directly-named
  // createSignal/createMemo declarations at this scope.
  const {
    lists,
    activeList,
    loadRequest,
    setLists,
    scheduleSave,
    markUserInteracted,
    flushSave,
    cancelPendingSave,
    initialize,
    createNewList,
    selectList,
    deleteListById,
    handleClearAllLists,
    persistRename,
  } = useListStore(pairs, t, closeMenus, setSidebarOpen, isNarrowViewport)

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

  // WordTable's onChange: the live editor content becomes the source of
  // truth for both the `pairs` signal (rendering) and, synced immediately,
  // the active entry inside the store's `lists` (so a preview card / the URL
  // / a concurrent navigate always sees up-to-date content instead of
  // whatever was last persisted).
  const handleTableChange = (newPairs: Pair[]) => {
    markUserInteracted()
    setPairs(newPairs)
    const current = activeList()
    if (!current) return
    setLists(lists().map((l) => (l.id === current.id ? { ...l, pairs: newPairs } : l)))
    scheduleSave(current.id, newPairs, current.createdAt, current.title)
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
  // so the trailing blur-commit no-ops. The data effect (title normalization,
  // lists sync, in-flight-save title sync, persistence) lives in the store —
  // this is just the UI-focus guard around calling into it.
  const commitRename = (id: string, rawValue: string) => {
    if (renamingId() !== id) return
    setRenamingId(null)
    persistRename(id, rawValue)
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

  onMount(() => {
    // Mark that client JS is live. The narrow-viewport CSS keeps the drawer +
    // scrim hidden until this class is present, so a phone-width first paint
    // doesn't flash an open drawer over a dark scrim before hydration corrects
    // sidebarOpen to false below. Set on <html> (outside the island) so it
    // doesn't perturb hydration reconciliation.
    document.documentElement.classList.add('js-ready')
    if (isNarrowViewport()) setSidebarOpen(false)

    const flushOnVisibilityChange = () => {
      if (document.hidden) flushSave()
    }
    window.addEventListener('pagehide', flushSave)
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
      window.removeEventListener('pagehide', flushSave)
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
    <div className="app flex flex-col gap-5">
      <AppHeader
        locale={locale()}
        setLocale={setLocale}
        sidebarOpen={sidebarOpen()}
        setSidebarOpen={setSidebarOpen}
        onClearAllLists={() => void handleClearAllLists()}
      />
      {/* min-h keeps a short list's sidebar divider running down the page
          even when the sidebar's own content is much shorter, without
          forcing a scrollbar: 200px is everything vertical outside the
          workspace — server.tsx's .print-root padding-top (56px) + the
          header (~26px) + this .app flex gap above the workspace (20px) +
          .print-root's padding-bottom (96px). align-items:flex-start keeps
          the editor column top-aligned instead of stretching to match.
          (min-h resets to 0 on the narrow drawer layout — see app.css's
          720px media query.) */}
      <div
        className={
          sidebarOpen()
            ? 'workspace no-print flex items-start gap-6 min-h-[calc(100vh-200px)]'
            : 'workspace no-print sidebar-closed flex items-start gap-6 min-h-[calc(100vh-200px)]'
        }
      >
        <ListSidebar
          sidebarOpen={sidebarOpen()}
          setSidebarOpen={setSidebarOpen}
          locale={locale()}
          sidebarLists={sidebarLists()}
          onCreateNewList={createNewList}
          onSelectList={selectList}
          onRenameKeyDown={handleRenameKeyDown}
          onCommitRename={commitRename}
          onToggleMenu={toggleMenu}
          onStartRename={startRename}
          onDeleteListById={deleteListById}
        />

        <EditorMain
          breakIndices={breakIndices()}
          onChange={handleTableChange}
          locale={locale()}
          loadRequest={loadRequest()}
          pairsCount={pairs().length}
          pageFill={pageFill()}
          printDisabled={layout().pages.length === 0}
        />
      </div>
      <PrintSheets layout={layout()} settings={DEFAULTS} />
    </div>
  )
}
