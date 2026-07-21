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

  const t = createMemo(() => messages[locale()])

  // The list-CRUD + debounced-autosave state machine (piconic-ai/sora, see
  // src/lib/useListStore.ts for the full doc comments this used to carry
  // inline) — pairs/t/setSidebarOpen/isNarrowViewport are this component's
  // own reactive state, threaded through since the store can't hold them
  // itself. Destructured (not `const store = ...`) because the compiler's
  // cross-file reactive-factory inlining (#2325/#2332) only recognizes an
  // object-destructure call site — that's what lets `lists`/`activeList`
  // below be seen as ordinary signals/memos post-inlining, exactly as if
  // they were declared directly in this file. A plain
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
  } = useListStore(pairs, t, setSidebarOpen, isNarrowViewport)

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

    onCleanup(() => {
      window.removeEventListener('pagehide', flushSave)
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
          lists={lists()}
          activeListId={activeList()?.id ?? null}
          onCreateNewList={createNewList}
          onSelectList={selectList}
          onDeleteListById={deleteListById}
          onRenameCommit={persistRename}
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
