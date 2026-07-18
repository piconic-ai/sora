'use client'

import { createMemo } from '@barefootjs/client'
import { displayListTitle, historyItemTitle, messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import type { SavedList } from '../src/lib/storage/schema'
import type { Pair } from '../src/lib/types'

interface SidebarListEntry {
  item: SavedList
  active: boolean
  menuOpen: boolean
  renaming: boolean
}

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
  sidebarLists: SidebarListEntry[]
  onCreateNewList: () => void
  onSelectList: (id: string) => void
  onRenameKeyDown: (id: string, e: KeyboardEvent) => void
  onCommitRename: (id: string, value: string) => void
  onToggleMenu: (id: string) => void
  onStartRename: (id: string) => void
  onDeleteListById: (id: string) => void
}

export function ListSidebar(props: ListSidebarProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])

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
          onClick={props.onCreateNewList}
        >
          <span className="mr-1.5 text-[15px] leading-none" aria-hidden="true">+</span>
          {t().newList}
        </button>
        <div className="list-items flex flex-col gap-0.5 overflow-y-auto max-h-[calc(100vh-180px)]" role="list">
          {props.sidebarLists.map((entry) => (
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
                onClick={() => props.onSelectList(entry.item.id)}
              >
                {titleFor(props.locale, entry.item)}
              </button>
              <input
                type="text"
                className={entry.renaming ? listItemRenameInputClass.visible : listItemRenameInputClass.hidden}
                aria-label={t().renameListLabel}
                placeholder={placeholderFor(props.locale, entry.item.pairs, entry.item.createdAt)}
                onKeyDown={(e) => props.onRenameKeyDown(entry.item.id, e as KeyboardEvent)}
                onBlur={(e) => props.onCommitRename(entry.item.id, (e.target as HTMLInputElement).value)}
              />
              <div className={entry.renaming ? listItemMenuWrapClass.hidden : listItemMenuWrapClass.visible}>
                <button
                  type="button"
                  className={listItemMenuBtnClass}
                  aria-haspopup="menu"
                  aria-expanded={entry.menuOpen}
                  aria-label={t().listItemMenu}
                  onClick={() => props.onToggleMenu(entry.item.id)}
                >
                  <span aria-hidden="true">⋮</span>
                </button>
                <div className={entry.menuOpen ? listItemMenuClass.open : listItemMenuClass.closed} role="menu">
                  <button
                    type="button"
                    className={listItemMenuItemClass}
                    role="menuitem"
                    onClick={() => props.onStartRename(entry.item.id)}
                  >
                    {t().renameListLabel}
                  </button>
                  <button
                    type="button"
                    className={listItemMenuItemDangerClass}
                    role="menuitem"
                    onClick={() => props.onDeleteListById(entry.item.id)}
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
