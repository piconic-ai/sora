'use client'

import { createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'
import { displayListTitle, historyItemTitle, messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import type { SavedList } from '../src/lib/storage/schema'
import type { Pair } from '../src/lib/types'

// Plain `string` param, cast internal to the function body: an inline
// `as Locale` cast on a JSX-embedded call argument doesn't survive the
// compiler's SSR-mirror re-serialization (drops back to the untyped
// `string` prop, failing tsc on the generated public/components/*.tsx —
// same class of gap as the null-typed-let and updater-fn quirks in the
// framework notes). Keeping the cast inside a normal function body sidesteps
// the re-serialization entirely.
function titleFor(locale: string, item: SavedList): string {
  return displayListTitle((locale as Locale) ?? 'ja', item)
}
function placeholderFor(locale: string, pairs: Pair[], createdAt: number): string {
  return historyItemTitle((locale as Locale) ?? 'ja', pairs, createdAt)
}

// Every className below is a full literal string (never a template literal
// with a per-item interpolation) — BarefootJS's compiler doesn't treat an
// interpolated className as reactive, so a runtime-conditional look is
// always a plain ternary between whole literal strings (composed here from
// smaller constants at module scope, which IS safe: the composition runs
// once at load time, not per render).
//
// "list-item"/"is-active"/"is-renaming"/"list-item-select"/
// "list-item-menu-wrap"/"list-item-rename-input"/"list-item-menu"/
// "is-open" are kept as bare hook classes alongside the utilities — see
// App.tsx's `.list-item-menu.is-open` / `.list-item.is-renaming
// .list-item-rename-input` / `.list-item-menu-wrap` queries.
const listItemBase = 'group flex items-center gap-0.5 rounded-md transition-colors duration-150 hover:bg-[#f6f6f6]'
const listItemActiveBg = 'bg-[#f2f2f2]'
const listItemClass = {
  plain: `list-item ${listItemBase}`,
  active: `list-item is-active ${listItemBase} ${listItemActiveBg}`,
  renaming: `list-item is-renaming ${listItemBase}`,
  activeRenaming: `list-item is-active is-renaming ${listItemBase} ${listItemActiveBg}`,
}

const listItemSelectBase =
  'flex-1 min-w-0 py-[7px] px-2 text-[13px] font-[inherit] text-left bg-transparent border-0 rounded-md cursor-pointer truncate focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--brand)]'
const listItemSelectClass = {
  activeVisible: `list-item-select ${listItemSelectBase} text-ink font-semibold`,
  activeHidden: `list-item-select hidden ${listItemSelectBase} text-ink font-semibold`,
  plainVisible: `list-item-select ${listItemSelectBase} text-[#666]`,
  plainHidden: `list-item-select hidden ${listItemSelectBase} text-[#666]`,
}

const listItemMenuWrapBase = 'relative flex-shrink-0 mr-1'
const listItemMenuWrapClass = {
  visible: `list-item-menu-wrap ${listItemMenuWrapBase}`,
  hidden: `list-item-menu-wrap hidden ${listItemMenuWrapBase}`,
}

// ⋮ menu trigger: hidden until the row is hovered/focused or its own menu
// is open — group-hover picks up the row (.list-item, marked "group"
// above) being hovered; aria-expanded picks up the open state, matching
// the same attribute the button itself sets.
const listItemMenuBtnClass =
  'list-item-menu-btn w-[22px] h-[22px] inline-flex items-center justify-center text-base leading-none text-[#999] bg-transparent border-0 rounded-[4px] cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 hover:text-[#111] hover:bg-[#ececec] aria-expanded:text-[#111] aria-expanded:bg-[#ececec] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_#111]'

// Positioned `fixed` and placed under its ⋮ button by JS (App's
// positionMenu) rather than absolutely inside the row: the sidebar's
// list is an overflow-y:auto scroll container, which would clip an
// absolutely-positioned dropdown on the lower rows. The off-screen
// default keeps it from flashing at 0,0 before JS sets the real
// coordinates.
const listItemMenuBase =
  'fixed -top-[9999px] -left-[9999px] z-30 min-w-[148px] p-1 bg-white border border-[#eee] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.14)]'
const listItemMenuClass = {
  open: `list-item-menu is-open block ${listItemMenuBase}`,
  closed: `list-item-menu hidden ${listItemMenuBase}`,
}

const listItemMenuItemBase = 'block w-full py-2 px-2.5 text-[13px] font-[inherit] text-left bg-transparent border-0 rounded-[5px] cursor-pointer whitespace-nowrap'
const listItemMenuItemClass = `${listItemMenuItemBase} text-[#333] hover:bg-[#f4f4f4]`
const listItemMenuItemDangerClass = `${listItemMenuItemBase} text-[#b23a2e] hover:bg-[#fdf2f1]`

// Inline rename editor: shares the row with the select button, which is
// swapped out for it while `is-renaming` is set (App's renamingId). Kept in
// the DOM at all times so toggling rename never changes the row's structure
// inside the reactive .map().
const listItemRenameInputBase =
  'flex-1 min-w-0 py-1.5 px-[7px] text-[13px] font-[inherit] text-ink bg-white border border-brand rounded-md outline-none'
const listItemRenameInputClass = {
  visible: `list-item-rename-input block ${listItemRenameInputBase}`,
  hidden: `list-item-rename-input hidden ${listItemRenameInputBase}`,
}

interface ListSidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  locale: string
  lists: SavedList[]
  activeListId: string | null
  onCreateNewList: () => void
  onSelectList: (id: string) => void
  onDeleteListById: (id: string) => void
  /** The rename's *data* effect only (title normalization, persistence) —
   *  ListSidebar owns the renamingId()-focused UI guard around it (see
   *  commitRename below), mirroring how App.tsx used to wrap this same
   *  call before the sidebar's UI state moved here. */
  onRenameCommit: (id: string, value: string) => void
}

export function ListSidebar(props: ListSidebarProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])

  // Per-list-item UI state for the ⋮ menu and inline rename. Held as the id
  // of the single open menu / list being renamed (or null). Folded into the
  // `sidebarLists` memo below (alongside `active`) so the render stays a
  // single-level `.map()` — see #2218 in the memory notes. Never persisted:
  // both reset on any card-switching/mutating action and on outside
  // click/ESC.
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

  // Opens the inline editor for a list: both the select button and a hidden
  // <input> are always rendered per row (see the render below); flipping
  // `renamingId` toggles which is shown via CSS, so no DOM structure changes
  // inside the reactive `.map()`. The input is *uncontrolled* — its value is
  // seeded here from the current title (or left blank so the placeholder
  // shows the auto-generated name), after the render has applied
  // `is-renaming`.
  const startRename = (id: string) => {
    setMenuOpenId(null)
    setRenamingId(id)
    const list = props.lists.find((l) => l.id === id)
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
  // so the trailing blur-commit no-ops.
  const commitRename = (id: string, rawValue: string) => {
    if (renamingId() !== id) return
    setRenamingId(null)
    props.onRenameCommit(id, rawValue)
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

  // This component's view of `props.lists`. `lists` is held in creation
  // order (oldest first) by the store — the order its index math relies on
  // — but the sidebar shows it newest-first, so a freshly created list
  // appears at the top, directly under the New button. Each entry carries a
  // precomputed `active` flag (from `props.activeListId`, not recomputed
  // locally) plus this component's own `menuOpen`/`renaming` state, keeping
  // the reactive work to a single-level `.map()` in the render (nested/
  // index-keyed loops are avoided; see barefoot #2218).
  const sidebarLists = createMemo(() => {
    const menuId = menuOpenId()
    const renameId = renamingId()
    return [...props.lists]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({
        item,
        active: item.id === props.activeListId,
        menuOpen: item.id === menuId,
        renaming: item.id === renameId,
      }))
  })

  onMount(() => {
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
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onDocKeyDown)
      document.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    })
  })

  return (
    <>
      <aside
        id="list-sidebar"
        className="list-sidebar flex-[0_0_220px] w-[220px] flex flex-col gap-2.5 border-r border-r-[#eee] pr-5 box-border self-stretch"
        aria-label={t().listsLabel}
      >
        <button
          type="button"
          className="self-start w-6 h-6 p-0 inline-flex items-center justify-center text-sm leading-none text-ink-3 bg-transparent border border-hairline rounded-md cursor-pointer transition-colors duration-150 hover:text-ink hover:border-[#ccc] focus-visible:outline-none focus-visible:border-brand"
          aria-expanded={props.sidebarOpen}
          aria-controls="list-sidebar"
          aria-label={t().sidebarToggleLabel}
          onClick={() => props.setSidebarOpen(false)}
        >
          <span className="sidebar-toggle-icon sidebar-toggle-icon--collapse" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="flex items-center justify-center w-full py-2 px-2.5 text-[13px] font-[inherit] leading-[1.4] text-[#444] bg-transparent border border-hairline rounded-md cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-ink hover:border-[#ccc] hover:bg-paper-tint focus-visible:outline-none focus-visible:border-brand"
          onClick={() => { closeMenus(); props.onCreateNewList() }}
        >
          <span className="mr-1.5 text-[15px] leading-none" aria-hidden="true">+</span>
          {t().newList}
        </button>
        <div className="list-items flex flex-col gap-0.5 overflow-y-auto max-h-[calc(100vh-180px)]" role="list">
          {sidebarLists().map((entry) => (
            <div
              className={
                entry.renaming
                  ? entry.active
                    ? listItemClass.activeRenaming
                    : listItemClass.renaming
                  : entry.active
                    ? listItemClass.active
                    : listItemClass.plain
              }
              role="listitem"
              key={entry.item.id}
            >
              <button
                type="button"
                className={
                  entry.renaming
                    ? entry.active
                      ? listItemSelectClass.activeHidden
                      : listItemSelectClass.plainHidden
                    : entry.active
                      ? listItemSelectClass.activeVisible
                      : listItemSelectClass.plainVisible
                }
                aria-current={entry.active ? 'true' : undefined}
                onClick={() => { closeMenus(); props.onSelectList(entry.item.id) }}
              >
                {titleFor(props.locale, entry.item)}
              </button>
              <input
                type="text"
                className={entry.renaming ? listItemRenameInputClass.visible : listItemRenameInputClass.hidden}
                aria-label={t().renameListLabel}
                placeholder={placeholderFor(props.locale, entry.item.pairs, entry.item.createdAt)}
                onKeyDown={(e) => handleRenameKeyDown(entry.item.id, e as KeyboardEvent)}
                onBlur={(e) => commitRename(entry.item.id, (e.target as HTMLInputElement).value)}
              />
              <div className={entry.renaming ? listItemMenuWrapClass.hidden : listItemMenuWrapClass.visible}>
                <button
                  type="button"
                  className={listItemMenuBtnClass}
                  aria-haspopup="menu"
                  aria-expanded={entry.menuOpen}
                  aria-label={t().listItemMenu}
                  onClick={() => toggleMenu(entry.item.id)}
                >
                  <span aria-hidden="true">⋮</span>
                </button>
                <div className={entry.menuOpen ? listItemMenuClass.open : listItemMenuClass.closed} role="menu">
                  <button
                    type="button"
                    className={listItemMenuItemClass}
                    role="menuitem"
                    onClick={() => startRename(entry.item.id)}
                  >
                    {t().renameListLabel}
                  </button>
                  <button
                    type="button"
                    className={listItemMenuItemDangerClass}
                    role="menuitem"
                    onClick={() => { closeMenus(); props.onDeleteListById(entry.item.id) }}
                  >
                    {t().deleteThisList}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      {/* Reopen button, rendered where the sidebar's own collapse button
          sits while open (workspace top-left) — the two toggles share one
          screen position, so opening and closing never requires moving
          the mouse. "sidebar-open--inline" kept as a bare hook class: the
          720px media query switches between this and AppHeader's
          .sidebar-open--header — only one of the two is ever visible. */}
      {!props.sidebarOpen ? (
        <button
          type="button"
          className="sidebar-open--inline flex-shrink-0 w-6 h-6 p-0 inline-flex items-center justify-center text-sm leading-none text-ink-3 bg-transparent border border-hairline rounded-md cursor-pointer transition-colors duration-150 hover:text-ink hover:border-[#ccc] focus-visible:outline-none focus-visible:border-brand"
          aria-expanded={props.sidebarOpen}
          aria-controls="list-sidebar"
          aria-label={t().sidebarToggleLabel}
          onClick={() => props.setSidebarOpen(true)}
        >
          <span className="sidebar-toggle-icon sidebar-toggle-icon--expand" aria-hidden="true" />
        </button>
      ) : null}
      {props.sidebarOpen && (
        <div className="sidebar-scrim hidden" aria-hidden="true" onClick={() => props.setSidebarOpen(false)} />
      )}
    </>
  )
}
