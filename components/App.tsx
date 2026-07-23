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
import { useListStore } from '../src/lib/useListStore'
import type { Pair } from '../src/lib/types'

interface AppProps {
  locale: string
}

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [locale, setLocale] = createSignal<Locale>((props.locale as Locale) ?? 'ja')

  // Starts `true` (a wide-viewport assumption) even off wide viewports so SSR
  // and the first client render always match; onMount corrects it once
  // matchMedia — client-only — is available. Not persisted: every load
  // re-derives it from the current viewport.
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const isNarrowViewport = () => window.matchMedia('(max-width: 720px)').matches

  const t = createMemo(() => messages[locale()])

  // Destructured, not `const store = useListStore(...)`: the compiler's
  // cross-file reactive-factory inlining only recognizes an object-destructure
  // call site. A plain assignment would compile, but every signal the store
  // creates would stay invisible to reactivity analysis — no DOM update
  // bindings.
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
  // pageBreakAfterPairIndex includes the very last pair too, but there's no
  // line to draw after the final row — drop that last entry.
  const breakIndices = createMemo(() => {
    const all = layout().pageBreakAfterPairIndex
    return all.length > 1 ? all.slice(0, -1) : []
  })

  // Synced into `lists` immediately, not just scheduled for debounced save —
  // a concurrent navigate/URL/preview must see live content, not whatever
  // was last persisted.
  const handleTableChange = (newPairs: Pair[]) => {
    markUserInteracted()
    setPairs(newPairs)
    const current = activeList()
    if (!current) return
    setLists(lists().map((l) => (l.id === current.id ? { ...l, pairs: newPairs } : l)))
    scheduleSave(current.id, newPairs, current.createdAt, current.title)
  }

  onMount(() => {
    // The narrow-viewport CSS keeps the drawer + scrim hidden until this
    // class is present, avoiding a flash of an open drawer before hydration
    // corrects sidebarOpen below. Set on <html>, outside the island, so it
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

  // SSR already sets title/lang on first paint; this is what updates them on
  // a language switch without a full reload. The cookie lets the next SSR
  // request (server.tsx's resolveLocale) pick the same locale.
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
          printDisabled={layout().pages.length === 0}
        />
      </div>
      {/* Rendered off-screen (print.css hides .print-sheets under @media
          screen) — this is the real print DOM, shown only when printing. */}
      <PrintSheets layout={layout()} settings={DEFAULTS} />
    </div>
  )
}
