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
    // A single `display: contents` root, not a Fragment: the reopen button
    // and scrim are siblings of <aside>, not descendants of it, and a
    // fragment-root's reactive conditional swap (insert()'s
    // updateFragmentConditional) only searches the scope element's own
    // *descendants* for a branch's comment markers — a marker that sits as
    // the scope's *sibling* is never found, so the conditional silently
    // never updates after the first render. Confirmed in-browser: closing
    // the sidebar correctly flipped every state this component owns
    // (sidebar-collapse's aria-expanded, the .workspace class up in App)
    // except this one conditional, which stayed frozen on its initial
    // (empty) branch forever. `display: contents` keeps <aside> a direct
    // flex child of .workspace (needed for its `flex: 0 0 220px` sizing) —
    // unlike AppHeader's plain <div> wrapper, a normal block box here would
    // swallow that flex item into a single wrapper box instead.
    <div style="display: contents">
      <aside id="list-sidebar" className="list-sidebar" aria-label={t().listsLabel}>
        <button
          type="button"
          className="sidebar-collapse"
          aria-expanded={props.sidebarOpen}
          aria-controls="list-sidebar"
          aria-label={t().sidebarToggleLabel}
          onClick={() => props.setSidebarOpen(false)}
        >
          <span className="sidebar-toggle-icon" aria-hidden="true" />
        </button>
        <button type="button" className="new-button" onClick={props.onCreateNewList}>
          <span className="new-button-plus" aria-hidden="true">+</span>
          {t().newList}
        </button>
        <div className="list-items" role="list">
          {props.sidebarLists.map((entry) => (
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
                onClick={() => props.onSelectList(entry.item.id)}
              >
                {titleFor(props.locale, entry.item)}
              </button>
              <input
                type="text"
                className="list-item-rename-input"
                aria-label={t().renameListLabel}
                placeholder={placeholderFor(props.locale, entry.item.pairs, entry.item.createdAt)}
                onKeyDown={(e) => props.onRenameKeyDown(entry.item.id, e as KeyboardEvent)}
                onBlur={(e) => props.onCommitRename(entry.item.id, (e.target as HTMLInputElement).value)}
              />
              <div className="list-item-menu-wrap">
                <button
                  type="button"
                  className="list-item-menu-btn"
                  aria-haspopup="menu"
                  aria-expanded={entry.menuOpen}
                  aria-label={t().listItemMenu}
                  onClick={() => props.onToggleMenu(entry.item.id)}
                >
                  <span aria-hidden="true">⋮</span>
                </button>
                <div className={entry.menuOpen ? 'list-item-menu is-open' : 'list-item-menu'} role="menu">
                  <button
                    type="button"
                    className="list-item-menu-item"
                    role="menuitem"
                    onClick={() => props.onStartRename(entry.item.id)}
                  >
                    {t().renameListLabel}
                  </button>
                  <button
                    type="button"
                    className="list-item-menu-item is-danger"
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
          the mouse. */}
      {!props.sidebarOpen ? (
        <button
          type="button"
          className="sidebar-open sidebar-open--inline"
          aria-expanded={props.sidebarOpen}
          aria-controls="list-sidebar"
          aria-label={t().sidebarToggleLabel}
          onClick={() => props.setSidebarOpen(true)}
        >
          <span className="sidebar-toggle-icon" aria-hidden="true" />
        </button>
      ) : null}
      {props.sidebarOpen && (
        <div className="sidebar-scrim" aria-hidden="true" onClick={() => props.setSidebarOpen(false)} />
      )}
    </div>
  )
}
