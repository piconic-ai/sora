import type { Page } from '@playwright/test'
import { test, expect, gotoReady, setLocale, clearSoraDb, seedLists, waitForHydration } from './fixtures'

// components/App.tsx's saved-list state machine (sidebar CRUD, autosave,
// URL routing, narrow-viewport drawer) + components/ListSidebar.tsx. The
// storage layer itself (create/update/rename/dedup/title-preservation) is
// heavily unit-tested (tests/lists.test.ts, 312 lines, plus listSchema/
// active/drafts/migrateLegacyDraft/listnav.test.ts) — these tests cover
// what those can't: the App state machine driving real IndexedDB in a real
// browser, URL/history, and timing (debounce/flush/races).

const rows = (page: Page) => page.locator('.word-table tbody tr')
const frontInput = (page: Page, i: number) => rows(page).nth(i).locator('input').nth(0)
const backInput = (page: Page, i: number) => rows(page).nth(i).locator('input').nth(1)
const listItems = (page: Page) => page.locator('.list-item')
const newButton = (page: Page) => page.getByRole('button', { name: '新規作成' })
const menuButtonFor = (page: Page, itemLabel: string | RegExp) =>
  page.locator('.list-item').filter({ hasText: itemLabel }).getByRole('button', { name: '項目メニュー' })
// Every row renders its own (usually hidden) rename input — scope to the
// one row currently in rename mode, or this matches multiple elements as
// soon as more than one list exists (App.tsx finds it the same way, via
// '.list-item.is-renaming .list-item-rename-input').
const renameInput = (page: Page) => page.locator('.list-item.is-renaming .list-item-rename-input')

/**
 * Opens the ⋮ menu for the row matching `itemLabel` and clicks Rename.
 * Crucially waits for the input to actually be focused before returning:
 * startRename() (App.tsx) seeds the input's value and focus/select from a
 * requestAnimationFrame callback, one tick *after* `renamingId` (and thus
 * `is-renaming`/the input's visibility) changes. A `.fill()` issued before
 * that rAF runs can land, then be silently overwritten back to '' when the
 * delayed callback finally sets `input.value = initial` — a genuine race
 * this suite hit (a rename committing as blank, reverting to the
 * auto-generated label, in the ~1 frame window before the rAF lands).
 */
async function openRename(page: Page, itemLabel: string | RegExp) {
  await menuButtonFor(page, itemLabel).click()
  await page.getByRole('menuitem', { name: '名前を変更' }).click()
  const input = renameInput(page)
  await expect(input).toBeFocused()
  return input
}

async function gotoWithPairs(page: Page, pairs: { front: string; back: string }[] = [], id = 'seed'): Promise<void> {
  await setLocale(page, 'ja')
  await clearSoraDb(page)
  await seedLists(page, [{ id, pairs, createdAt: 1000 }], id)
  await gotoReady(page, '/')
}

test.describe('First load & seeding', () => {
  test('27: fresh profile seeds the sample list, active, URL rewritten to /l/{id}', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')
    await expect(page.locator('.list-item')).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Japan Travel Phrases/ })).toBeVisible()
    await expect(rows(page)).toHaveCount(29) // 28 sample pairs + trailing ghost
    await expect(page).toHaveURL(/\/l\/.+/)
  })

  test('28: reload after first visit does not duplicate the sample', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')
    const urlAfterFirstLoad = page.url()
    await page.reload()
    await waitForHydration(page)
    await expect(page.locator('.list-item')).toHaveCount(1)
    expect(page.url()).toBe(urlAfterFirstLoad)
  })
})

test.describe('Create / switch / evaporate', () => {
  test('29: New clears the editor, focuses the first cell, adds a top sidebar entry, switches URL', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const urlBefore = page.url()
    await newButton(page).click()
    await expect(rows(page)).toHaveCount(1)
    await expect(frontInput(page, 0)).toBeFocused()
    await expect(listItems(page)).toHaveCount(2)
    // Newest-first view: the fresh (empty) card's auto-label sits at the top.
    await expect(listItems(page).first()).toContainText('空のリスト')
    expect(page.url()).not.toBe(urlBefore)
  })

  test("30: an untouched new card is not persisted — reload discards it and restores the previous list", async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await newButton(page).click()
    await expect(listItems(page)).toHaveCount(2)
    await page.waitForTimeout(200)
    await page.reload()
    await waitForHydration(page)
    await expect(listItems(page)).toHaveCount(1)
    await expect(frontInput(page, 0)).toHaveValue('A')
  })

  test('31: switching lists swaps editor content and the active highlight, and back again preserves both', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    await expect(frontInput(page, 0)).toHaveValue('A')

    await page.getByRole('button', { name: /^B/ }).click()
    await expect(frontInput(page, 0)).toHaveValue('B')
    await expect(page.locator('.list-item.is-active')).toContainText('B')

    await page.getByRole('button', { name: /^A/ }).click()
    await expect(frontInput(page, 0)).toHaveValue('A')
    await expect(page.locator('.list-item.is-active')).toContainText('A')
  })

  test('32: fast switch before the autosave debounce fires does not lose the last keystrokes', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    await frontInput(page, 0).fill('A-edited')
    // Switch immediately — well inside the 500ms debounce window.
    await page.getByRole('button', { name: /^B/ }).click()
    await page.getByRole('button', { name: /A-edited/ }).click()
    await expect(frontInput(page, 0)).toHaveValue('A-edited')
  })

  test('33: deleting all rows of a non-active-anymore list evaporates it after leaving', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    await frontInput(page, 0).fill('')
    await backInput(page, 0).fill('')
    await expect(listItems(page)).toHaveCount(2) // still present while active
    await page.getByRole('button', { name: /^B/ }).click() // leave -> evaporates
    await expect(listItems(page)).toHaveCount(1)
    // commitActiveEdits's deleteList() call is fire-and-forget (`void
    // deleteList(...)`) — give the async IndexedDB transaction a moment to
    // actually commit before reloading, or the reload can race ahead of it.
    await page.waitForTimeout(300)
    await page.reload()
    await waitForHydration(page)
    await expect(listItems(page)).toHaveCount(1)
  })
})

test.describe('Rename', () => {
  test('34: rename opens a focused, fully-selected input in place of the select button', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const input = await openRename(page, /A/)
    const selection = await input.evaluate((el: HTMLInputElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      value: el.value,
    }))
    expect(selection.start).toBe(0)
    expect(selection.end).toBe(selection.value.length)
  })

  test('35: Enter commits the new name, updates the label, and persists across reload', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const input = await openRename(page, /A/)
    await input.fill('My Custom Title')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'My Custom Title' })).toBeVisible()
    await page.waitForTimeout(200)
    await page.reload()
    await waitForHydration(page)
    await expect(page.getByRole('button', { name: 'My Custom Title' })).toBeVisible()
  })

  test('36: Escape cancels the rename and the trailing blur does not commit it', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const input = await openRename(page, /A/)
    await input.fill('Should Not Stick')
    await page.keyboard.press('Escape')
    // Escape already flips `renamingId` to null (App.tsx), so the input's
    // row is no longer `.list-item.is-renaming` — the *element* is still
    // in the DOM (just re-classed hidden) and typically still has focus,
    // but a locator re-scoped to ".is-renaming ..." can no longer find it.
    // Blur whatever the browser currently has focused instead of
    // re-resolving that locator.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await expect(page.getByRole('button', { name: 'Should Not Stick' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /A ほか1語|^A · /, exact: false })).toBeVisible()
  })

  test('37: blur alone (no Enter) commits the rename', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const input = await openRename(page, /A/)
    await input.fill('Blur Commit')
    // A real click elsewhere (rather than a programmatic el.blur() via
    // evaluate) fires a genuine blur the same way a user would trigger
    // one, and sidesteps any doubt about whether the element evaluate()
    // re-resolves was still the truly-focused one. The table header has no
    // click handler of its own, so this is a neutral "click away".
    await page.getByRole('columnheader', { name: '表面' }).click()
    await expect(page.getByRole('button', { name: 'Blur Commit' })).toBeVisible()
  })

  test('38: committing an empty/whitespace name reverts to the auto-generated, locale-dependent label', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const input = await openRename(page, /A/)
    await input.fill('Temp Name')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Temp Name' })).toBeVisible()

    const input2 = await openRename(page, /Temp Name/)
    await input2.fill('   ')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /^A /, exact: false })).toBeVisible()
  })

  test('39: renaming a still-memory-only new card carries the title into its first real write', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'X', back: 'x' }])
    await newButton(page).click() // fresh, unsaved card
    const input = await openRename(page, /空のリスト/)
    await input.fill('Named Before First Save')
    await page.keyboard.press('Enter')
    // First real content — the card's first-ever IndexedDB write.
    await frontInput(page, 0).fill('First Pair')
    await page.waitForTimeout(700)
    await page.reload()
    await waitForHydration(page)
    await expect(page.getByRole('button', { name: 'Named Before First Save' })).toBeVisible()
  })

  test('40: a renamed list keeps its title through further autosaves', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const input = await openRename(page, /A/)
    await input.fill('Stays Named')
    await page.keyboard.press('Enter')
    await frontInput(page, 1).fill('B')
    await backInput(page, 1).fill('b')
    // Two independent fire-and-forget async chains must both settle: the
    // rename's own getList()-then-renameList() round trip (commitRename)
    // and the pairs autosave debounce (500ms) — extra margin over the
    // usual 700ms since neither is awaited by anything this test can hook.
    await page.waitForTimeout(1200)
    await page.reload()
    await waitForHydration(page)
    await expect(page.getByRole('button', { name: 'Stays Named' })).toBeVisible()
    await expect(frontInput(page, 1)).toHaveValue('B')
  })
})

test.describe('Delete / clear-all (confirm dialogs)', () => {
  test('41: delete on a non-active list confirms, then removes it without disturbing the editor', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    let dialogMessage = ''
    page.once('dialog', (d) => {
      dialogMessage = d.message()
      void d.dismiss()
    })
    await menuButtonFor(page, /B/).click()
    await page.getByRole('menuitem', { name: 'このリストを削除' }).click()
    expect(dialogMessage).toBe('このリストを削除しますか？')
    await expect(listItems(page)).toHaveCount(2) // dismissed -> nothing removed
    await expect(frontInput(page, 0)).toHaveValue('A')

    page.once('dialog', (d) => void d.accept())
    await menuButtonFor(page, /B/).click()
    await page.getByRole('menuitem', { name: 'このリストを削除' }).click()
    await expect(listItems(page)).toHaveCount(1)
    await expect(frontInput(page, 0)).toHaveValue('A') // editor untouched, still on A
  })

  test('42: deleting the active non-empty list confirms, then moves to a neighbor', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-b',
    )
    await gotoReady(page, '/')
    await expect(frontInput(page, 0)).toHaveValue('B')
    page.once('dialog', (d) => void d.accept())
    await menuButtonFor(page, /B/).click()
    await page.getByRole('menuitem', { name: 'このリストを削除' }).click()
    await expect(listItems(page)).toHaveCount(1)
    await expect(frontInput(page, 0)).toHaveValue('A')
  })

  test('43: deleting the only list replaces it with a fresh empty card', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    page.once('dialog', (d) => void d.accept())
    await menuButtonFor(page, /A/).click()
    await page.getByRole('menuitem', { name: 'このリストを削除' }).click()
    await expect(listItems(page)).toHaveCount(1)
    await expect(rows(page)).toHaveCount(1)
    await expect(frontInput(page, 0)).toHaveValue('')
    await expect(page.getByRole('button', { name: '印刷' })).toBeDisabled()
  })

  test('44: deleting an empty active card asks no confirmation', async ({ page }) => {
    await gotoWithPairs(page, []) // empty active card
    let dialogFired = false
    page.once('dialog', () => {
      dialogFired = true
    })
    await menuButtonFor(page, /空のリスト/).click()
    await page.getByRole('menuitem', { name: 'このリストを削除' }).click()
    await page.waitForTimeout(300)
    expect(dialogFired).toBe(false)
  })

  test('45: clear all history wipes every list and reseeds the sample', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    await page.getByRole('button', { name: 'Soraについて' }).click()
    let dialogMessage = ''
    page.once('dialog', (d) => {
      dialogMessage = d.message()
      void d.accept()
    })
    await page.getByRole('button', { name: '履歴をすべて削除' }).click()
    expect(dialogMessage).toBe('すべてのリストを削除しますか？この操作は取り消せません。')
    await expect(listItems(page)).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Japan Travel Phrases/ })).toBeVisible()
  })

  test('46: reaching the 50-list cap confirms eviction of the oldest before creating a new card', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      id: `list-${i}`,
      pairs: [{ front: `F${i}`, back: `B${i}` }],
      createdAt: 1000 + i,
    }))
    await seedLists(page, fifty, 'list-49')
    await gotoReady(page, '/')
    await expect(listItems(page)).toHaveCount(50)

    // Cancel path: no new card, active list unchanged, editor still usable.
    page.once('dialog', (d) => void d.dismiss())
    await newButton(page).click()
    await expect(listItems(page)).toHaveCount(50)
    await expect(frontInput(page, 0)).toHaveValue('F49')
    await frontInput(page, 1).fill('still works')
    await expect(frontInput(page, 1)).toHaveValue('still works')

    // Accept path: oldest (list-0) evicted, one fresh card added, still <= 50.
    let dialogMessage = ''
    page.once('dialog', (d) => {
      dialogMessage = d.message()
      void d.accept()
    })
    await newButton(page).click()
    expect(dialogMessage).toBe('保存できるリストは50件までです。最も古いリストを削除して新規作成しますか？')
    await expect(listItems(page)).toHaveCount(50)
    await expect(page.getByRole('button', { name: /F0[^0-9]/ })).not.toBeVisible()
  })
})

test.describe('Autosave timing & durability', () => {
  test('47: typing, waiting past the debounce, and reloading restores the content', async ({ page }) => {
    await gotoWithPairs(page)
    await frontInput(page, 0).fill('Persisted')
    await page.waitForTimeout(700)
    await page.reload()
    await waitForHydration(page)
    await expect(frontInput(page, 0)).toHaveValue('Persisted')
  })

  test('48: a visibilitychange hide before the debounce fires still flushes the save', async ({ page }) => {
    await gotoWithPairs(page)
    await frontInput(page, 0).fill('FlushedOnHide')
    // Simulate the tab being hidden well inside the 500ms debounce window.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(100)
    await page.reload()
    await waitForHydration(page)
    await expect(frontInput(page, 0)).toHaveValue('FlushedOnHide')
  })

  test('49: a pagehide before the debounce fires flushes the save', async ({ page }) => {
    await gotoWithPairs(page)
    await frontInput(page, 0).fill('FlushedOnPagehide')
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await page.waitForTimeout(100)
    await page.reload()
    await waitForHydration(page)
    await expect(frontInput(page, 0)).toHaveValue('FlushedOnPagehide')
  })
})

test.describe('URL routing', () => {
  test('51: direct-loading /l/{knownId} opens that list, not the stored active pointer', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a', // stored active pointer says A
    )
    await gotoReady(page, '/l/list-b') // but we navigate straight to B
    await expect(frontInput(page, 0)).toHaveValue('B')
  })

  test('52: direct-loading /l/{unknownId} falls back and corrects the URL', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(page, [{ id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 }], 'list-a')
    await gotoReady(page, '/l/does-not-exist')
    await expect(frontInput(page, 0)).toHaveValue('A')
    await expect(page).toHaveURL(/\/l\/list-a$/)
  })

  test('53: loading / with saved lists opens the last-active one and rewrites the URL', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-b',
    )
    await gotoReady(page, '/')
    await expect(frontInput(page, 0)).toHaveValue('B')
    await expect(page).toHaveURL(/\/l\/list-b$/)
  })
})

test.describe('Sidebar chrome (wide viewport)', () => {
  test('54: collapse hides the sidebar; the inline reopen button restores it', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await page.getByRole('button', { name: 'サイドバーの開閉' }).first().click()
    await expect(page.locator('#list-sidebar')).toBeHidden()
    await page.getByRole('button', { name: 'サイドバーの開閉' }).click()
    await expect(page.locator('#list-sidebar')).toBeVisible()
  })

  test('55: the menu positions near its button (not at the off-screen default), and closes on outside click/Escape/scroll', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const btn = menuButtonFor(page, /A/)
    await btn.click()
    const menu = page.locator('.list-item-menu.is-open')
    await expect(menu).toBeVisible()
    // positionMenu() (App.tsx) places the menu via a requestAnimationFrame
    // callback, one tick after `is-open` (and thus visibility) lands — the
    // element is visible before its position is actually set, so this
    // must poll rather than read the bounding box once.
    const btnBox = await btn.boundingBox()
    expect(btnBox).not.toBeNull()
    await expect
      .poll(async () => {
        const menuBox = await menu.boundingBox()
        return menuBox && btnBox ? Math.abs(menuBox.y - btnBox.y) : Number.POSITIVE_INFINITY
      })
      .toBeLessThan(200)

    await page.mouse.click(600, 400) // outside click
    await expect(page.locator('.list-item-menu.is-open')).toHaveCount(0)

    await btn.click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.list-item-menu.is-open')).toHaveCount(0)

    await btn.click()
    await page.locator('.list-items').evaluate((el) => el.dispatchEvent(new Event('scroll', { bubbles: true })))
    await expect(page.locator('.list-item-menu.is-open')).toHaveCount(0)
  })
})

test.describe('Sidebar chrome (narrow viewport)', () => {
  test.use({ viewport: { width: 400, height: 800 } })

  test('56: first load has the drawer closed and the header toggle visible', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await expect(page.locator('.list-sidebar')).toBeHidden()
    await expect(page.locator('.sidebar-open--header')).toBeVisible()
    await expect(page.locator('.sidebar-open--inline')).toBeHidden()
  })

  test('57: opening the drawer shows the scrim; clicking it closes the drawer', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await page.locator('.sidebar-open--header').click()
    await expect(page.locator('.list-sidebar')).toBeVisible()
    await expect(page.locator('.sidebar-scrim')).toBeVisible()
    // The drawer itself is `width: min(84vw, 300px)` = 300px at this 400px
    // viewport, so it only covers x 0-300 — click clear of it (x=350) or
    // the click lands on the drawer (which intercepts pointer events, per
    // its higher DOM/paint order) instead of the scrim behind it.
    await page.locator('.sidebar-scrim').click({ position: { x: 350, y: 5 } })
    await expect(page.locator('.list-sidebar')).toBeHidden()
  })

  test('58: selecting a list (even the active one) closes the drawer; New closes it and focuses the editor', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'B', back: 'b' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    await page.locator('.sidebar-open--header').click()
    await page.getByRole('button', { name: /^A/ }).click() // already-active item
    await expect(page.locator('.list-sidebar')).toBeHidden()

    await page.locator('.sidebar-open--header').click()
    await newButton(page).click()
    await expect(page.locator('.list-sidebar')).toBeHidden()
    await expect(frontInput(page, 0)).toBeFocused()
  })

  test('59: before hydration (no JS), the drawer and scrim stay hidden', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 400, height: 800 } })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('.list-sidebar')).toBeHidden()
    await expect(page.locator('.sidebar-scrim')).toBeHidden()
    await context.close()
  })
})

test.describe('Locale', () => {
  test('60: switching language updates headers, hint, sidebar labels, document.title, and <html lang>', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await page.getByLabel('Language').selectOption('en')
    await expect(page.getByRole('columnheader', { name: 'Front' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Back' })).toBeVisible()
    await expect(page).toHaveTitle('Sora — Learn by heart')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible()
  })

  test('61: reload after switching language keeps the SSR render in the new locale (cookie path)', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await page.getByLabel('Language').selectOption('en')
    await expect(page.getByRole('columnheader', { name: 'Front' })).toBeVisible()
    await page.reload()
    await waitForHydration(page)
    await expect(page.getByRole('columnheader', { name: 'Front' })).toBeVisible()
  })
})
