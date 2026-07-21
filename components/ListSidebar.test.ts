// Component IR test (BarefootJS's Layer 2 — see spec/testing.md in the
// barefootjs repo): verifies the COMPILER's output — reactive
// classification, event→setter static wiring, roles/aria — not runtime
// behavior. Behavior (Enter/blur idempotency, IME guards, positionMenu's
// rAF, outside-click/Escape dismissal) is Playwright's job
// (tests/e2e/list-management.spec.ts #34-40, #55, #57); ListSidebar has no
// src/lib logic of its own to unit-test the way useListStore.*.test.ts does.
//
// ListSidebar was chosen over App.tsx/WordTable.tsx as the first component
// to get this treatment: it was only recently turned from a pure
// presentational component into a stateful one (menuOpenId/renamingId
// signals, onMount/onCleanup), and its own comments call out three
// BarefootJS-specific footguns it was written around (all-literal-ternary
// classNames, single-level `.map()`, folding UI state into the
// `sidebarLists` memo) — exactly the kind of thing a compiler-output
// regression could silently break.
//
// `renderToTest` compiles the source text directly (no adapter, no DOM) —
// see @barefootjs/test's README/switch|checkbox|badge index.test.tsx in the
// barefootjs repo for the reference pattern this follows.
import { readFileSync } from 'fs'
import { describe, expect, test } from 'vitest'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(new URL('./ListSidebar.tsx', import.meta.url), 'utf-8')
const result = renderToTest(source, 'ListSidebar.tsx', 'ListSidebar')

test('compiles with no diagnostics', () => {
  expect(result.errors).toEqual([])
})

describe('reactive classification', () => {
  test('menuOpenId/renamingId are signals', () => {
    expect(result.signals).toContain('menuOpenId')
    expect(result.signals).toContain('renamingId')
  })

  test('t/sidebarLists are memos, not signals', () => {
    expect(result.memos).toContain('t')
    expect(result.memos).toContain('sidebarLists')
    expect(result.signals).not.toContain('t')
    expect(result.signals).not.toContain('sidebarLists')
  })
})

describe('event wiring', () => {
  // `setters` is the static set of signal setters a handler can reach
  // through its call graph, not which one actually fires for a given click
  // — toggleMenu/closeMenus/startRename each touch both menuOpenId and
  // renamingId depending on runtime state, so `setters` includes both for
  // all three. `via` (which local helper the handler is routed through) is
  // what actually distinguishes one click target from another here.
  const menuToggleButton = result.findAll({ tag: 'button' }).find((b) => b.aria.haspopup === 'menu')!
  // findAll returns menuitems in JSX/document order: [0] is the rename
  // item, [1] is the delete item (see the source's menu-item order).
  const [renameMenuItem, deleteMenuItem] = result.findAll({ role: 'menuitem' })
  const listItemRow = result.find({ role: 'listitem' })!
  const [selectButton, renameInput] = listItemRow.children

  test('the ⋮ button routes through toggleMenu to both menu/rename setters', () => {
    expect(menuToggleButton.onClick?.via).toContain('toggleMenu')
    expect(menuToggleButton.onClick?.setters).toEqual(
      expect.arrayContaining(['setMenuOpenId', 'setRenamingId']),
    )
  })

  test('the rename menu item routes through startRename', () => {
    expect(renameMenuItem.children[0]?.text).toBe('t().renameListLabel')
    expect(renameMenuItem.onClick?.via).toContain('startRename')
  })

  test('the delete menu item routes through closeMenus before the delete callback', () => {
    expect(deleteMenuItem.children[0]?.text).toBe('t().deleteThisList')
    expect(deleteMenuItem.onClick?.via).toContain('closeMenus')
    // props.onDeleteListById is a prop callback, not a local signal setter,
    // so it never appears in `setters` — only closeMenus's own setters do.
    expect(deleteMenuItem.onClick?.setters).toEqual(
      expect.arrayContaining(['setMenuOpenId', 'setRenamingId']),
    )
  })

  test('the select button also routes through closeMenus', () => {
    expect(selectButton.onClick?.via).toContain('closeMenus')
  })

  test('the rename input commits on blur and handles keys via their own local functions', () => {
    expect(renameInput.on('keydown')?.via).toContain('handleRenameKeyDown')
    expect(renameInput.on('blur')?.via).toContain('commitRename')
    expect(renameInput.on('blur')?.setters).toContain('setRenamingId')
  })
})

describe('accessibility', () => {
  test('the list/row/menu roles are present', () => {
    expect(result.find({ role: 'list' })).not.toBeNull()
    expect(result.find({ role: 'listitem' })).not.toBeNull()
    expect(result.find({ role: 'menu' })).not.toBeNull()
    expect(result.findAll({ role: 'menuitem' })).toHaveLength(2)
  })

  test('the ⋮ button advertises its popup and open state', () => {
    const menuToggleButton = result.findAll({ tag: 'button' }).find((b) => b.aria.haspopup === 'menu')!
    expect(menuToggleButton.aria.haspopup).toBe('menu')
    // The bound expression, not its resolved value (see the file-header note
    // on why classes/aria carry unresolved per-item expressions here) — this
    // still pins that aria-expanded is bound to the per-item state at all,
    // catching a regression that dropped the binding entirely.
    expect(menuToggleButton.aria.expanded).toBe('entry.menuOpen')
  })

  test("the select button's aria-current is bound to the per-item active state", () => {
    const listItemRow = result.find({ role: 'listitem' })!
    const [selectButton] = listItemRow.children
    expect(selectButton.aria.current).toContain('entry.active')
  })
})
