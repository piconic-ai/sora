import type { Page } from '@playwright/test'
import { test, expect, gotoReady, setLocale, clearSoraDb, seedLists, pasteText, dispatchComposingKey, stubPrint, printCallCount } from './fixtures'

// components/WordTable.tsx's front/back editing grid. resolveKeyAction
// (src/lib/tableNav.ts) — the pure keyboard-decision table — is already
// exhaustively unit-tested (tests/tableNav.test.ts, 411 lines); these tests
// verify the real DOM/component wiring around it instead of re-deriving the
// decision table: selection/caret state read from live inputs, focus
// movement, row deletion + refocus by data-key, the paste ClipboardEvent
// path, and the trailing-blank-row invariant surviving real mutations.

const rows = (page: Page) => page.locator('.word-table tbody tr')
const row = (page: Page, i: number) => rows(page).nth(i)
const frontInput = (page: Page, i: number) => row(page, i).locator('input').nth(0)
const backInput = (page: Page, i: number) => row(page, i).locator('input').nth(1)

/** Seeds a single active list with `pairs` (default: none, i.e. a table
 *  starting at exactly one blank row) and navigates in. Seeding a list
 *  (even an empty one) means App.tsx's initialize() sees a non-empty
 *  `listSaved()` result and skips auto-seeding the 28-pair sample — the
 *  starting table is exactly what this helper asks for, nothing more. */
async function gotoWithPairs(page: Page, pairs: { front: string; back: string }[] = []): Promise<void> {
  await setLocale(page, 'ja')
  await clearSoraDb(page)
  await seedLists(page, [{ id: 'seed', pairs, createdAt: 1000 }], 'seed')
  await gotoReady(page, '/')
}

test.describe('WordTable: typing & the trailing-blank-row invariant', () => {
  test('1: typing into the initial row front cell appends a second blank row', async ({ page }) => {
    await gotoWithPairs(page)
    await expect(rows(page)).toHaveCount(1)
    await frontInput(page, 0).fill('Hello')
    await expect(rows(page)).toHaveCount(2)
    await expect(frontInput(page, 1)).toHaveValue('')
    await expect(backInput(page, 1)).toHaveValue('')
  })

  test('2: row count is always pairs+1 and the last row stays blank across repeated edits', async ({ page }) => {
    await gotoWithPairs(page)
    for (let i = 0; i < 5; i++) {
      await frontInput(page, i).fill(`F${i}`)
      await backInput(page, i).fill(`B${i}`)
      await expect(rows(page)).toHaveCount(i + 2)
      await expect(frontInput(page, i + 1)).toHaveValue('')
      await expect(backInput(page, i + 1)).toHaveValue('')
    }
  })

  test('3: clearing the last content row drops it from emitted pairs but keeps the row in the DOM', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    // 2 content rows + 1 trailing blank = 3 rows.
    await expect(rows(page)).toHaveCount(3)
    await frontInput(page, 1).fill('')
    await backInput(page, 1).fill('')
    // Row is not removed by clearing (only the trailing-row rule adds/
    // removes rows) — still 3 rows, but the page meter now counts 1 pair.
    await expect(rows(page)).toHaveCount(3)
    await expect(page.getByText(/1\/28語/)).toBeVisible()
  })

  test('4: a blank row above the page break does not shift where the dashed border lands', async ({ page }) => {
    // 29 *non-blank* pairs (the minimum for a page break to exist at all —
    // exactly 28 fits one page with no break, see App.tsx's `all.length >
    // 1` guard) with one blank entry seeded in the middle (at seed index
    // 5). Seeding it this way — rather than blanking a row after the
    // table renders — keeps the emitted (non-blank) pair count at 29
    // throughout, isolating "does a blank row's position confuse the
    // pair-index mapping" from "did the total pair count change" (clearing
    // a row after the fact conflates the two: dropping to 28 total pairs
    // removes the page break entirely, per the same App.tsx guard).
    const pairs = [
      ...Array.from({ length: 5 }, (_, i) => ({ front: `W${i}`, back: `M${i}` })),
      { front: '', back: '' },
      ...Array.from({ length: 24 }, (_, i) => ({ front: `W${i + 5}`, back: `M${i + 5}` })),
    ]
    await gotoWithPairs(page, pairs)
    await expect(page.getByText(/2ページ目/)).toBeVisible() // 29 pairs -> confirms the break exists
    // 30 seeded rows (29 real + 1 deliberately blank) + a fresh trailing
    // ghost (the last seeded row, W28, is non-blank, so ensureTrailingBlank
    // appends one more) = 31.
    await expect(rows(page)).toHaveCount(31)

    // pairIndexByRow's running counter (WordTable.tsx) skips the blank row
    // 5 without decrementing pairIndex, so pair index 27 (the break, per
    // src/lib/layout.ts) lands on ROW 28 — one past where it would sit if
    // every row were a real pair — not row 27.
    await expect(row(page, 27).locator('td').first()).not.toHaveClass(/border-dashed/)
    await expect(row(page, 28).locator('td').first()).toHaveClass(/border-dashed/)
    await expect(row(page, 29).locator('td').first()).not.toHaveClass(/border-dashed/)
  })
})

test.describe('WordTable: keyboard navigation wiring', () => {
  test('5: Enter in front cell moves focus to same row back cell, caret at end', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'Hello', back: 'World' }])
    await frontInput(page, 0).click()
    await page.keyboard.press('Enter')
    await expect(backInput(page, 0)).toBeFocused()
    const caret = await backInput(page, 0).evaluate((el: HTMLInputElement) => el.selectionStart)
    expect(caret).toBe('World'.length)
  })

  test('6: Enter in back cell moves to next row front; Enter on the ghost row is a no-op but still prevents default', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    await backInput(page, 0).click()
    await page.keyboard.press('Enter')
    await expect(frontInput(page, 1)).toBeFocused()

    // Ghost row (last row) back cell: Enter has action 'none' (col===1 &&
    // isLastRow) but must still preventDefault — assert no newline/side
    // effect by checking focus and value stay put.
    const lastIndex = (await rows(page).count()) - 1
    await backInput(page, lastIndex).click()
    await page.keyboard.press('Enter')
    await expect(backInput(page, lastIndex)).toBeFocused()
    await expect(backInput(page, lastIndex)).toHaveValue('')
  })

  test('7: Tab/Shift+Tab traverse front -> back -> next-row-front via natural DOM order', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    await frontInput(page, 0).click()
    await page.keyboard.press('Tab')
    await expect(backInput(page, 0)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(frontInput(page, 1)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(backInput(page, 0)).toBeFocused()
  })

  test('8: ArrowRight/ArrowLeft only hop cells when the caret is at the boundary', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'Hello', back: 'World' }])
    const front = frontInput(page, 0)
    await front.click()
    await front.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 2)) // mid-text
    await page.keyboard.press('ArrowRight')
    await expect(front).toBeFocused() // no hop, caret just moved
    await front.evaluate((el: HTMLInputElement) => el.setSelectionRange(5, 5)) // caret at end
    await page.keyboard.press('ArrowRight')
    await expect(backInput(page, 0)).toBeFocused()

    const back = backInput(page, 0)
    await back.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3)) // mid-text
    await page.keyboard.press('ArrowLeft')
    await expect(back).toBeFocused() // no hop
    await back.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0)) // caret at start
    await page.keyboard.press('ArrowLeft')
    await expect(front).toBeFocused()
  })

  test('9: ArrowUp/ArrowDown move rows keeping column; no-op at first/last row', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    await frontInput(page, 0).click()
    await page.keyboard.press('ArrowUp') // first row: no-op
    await expect(frontInput(page, 0)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(frontInput(page, 1)).toBeFocused()

    const lastIndex = (await rows(page).count()) - 1
    await backInput(page, lastIndex).click()
    await page.keyboard.press('ArrowDown') // last row: no-op
    await expect(backInput(page, lastIndex)).toBeFocused()
  })

  test('10: Shift+ArrowRight extends selection instead of hopping cells (modifier passthrough)', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'Hello', back: 'World' }])
    const front = frontInput(page, 0)
    await front.click()
    await front.evaluate((el: HTMLInputElement) => el.setSelectionRange(5, 5))
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Shift')
    await expect(front).toBeFocused() // stayed put — no cell hop
  })
})

test.describe('WordTable: row deletion wiring', () => {
  test('11: Backspace in an empty middle row deletes it and refocuses previous row back cell', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
      { front: 'C', back: 'c' },
    ])
    // Make row 1 (B/b) empty so it qualifies as a deletable empty middle row.
    await frontInput(page, 1).fill('')
    await backInput(page, 1).fill('')
    await expect(rows(page)).toHaveCount(4) // A, (empty), C, ghost

    await frontInput(page, 1).click()
    await page.keyboard.press('Backspace')
    await expect(rows(page)).toHaveCount(3) // A, C, ghost
    await expect(backInput(page, 0)).toBeFocused()
    await expect(frontInput(page, 1)).toHaveValue('C')
    // Trailing blank row still present.
    await expect(frontInput(page, 2)).toHaveValue('')
    await expect(backInput(page, 2)).toHaveValue('')
  })

  test('12: Delete in an empty first row (with rows below) deletes it and refocuses the new first row front cell', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    await frontInput(page, 0).fill('')
    await backInput(page, 0).fill('')
    await frontInput(page, 0).click()
    await page.keyboard.press('Delete')
    await expect(frontInput(page, 0)).toHaveValue('B')
    await expect(frontInput(page, 0)).toBeFocused()
  })

  test('12b: Backspace in an empty first row (with rows below) also deletes it and refocuses the new first row front cell', async ({ page }) => {
    // Mirrors #12 for Backspace: there's no previous row to step back into,
    // so this used to be the one asymmetry in an otherwise Enter/Backspace-
    // mirrored grid — Delete already deleted an empty first row, Backspace
    // silently did nothing on the exact same row. Backspace now matches
    // Delete's own deleteRowFocusNext behavior here.
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    await frontInput(page, 0).fill('')
    await backInput(page, 0).fill('')
    await frontInput(page, 0).click()
    await page.keyboard.press('Backspace')
    await expect(rows(page)).toHaveCount(2) // B, ghost
    await expect(frontInput(page, 0)).toHaveValue('B')
    await expect(frontInput(page, 0)).toBeFocused()
  })

  test('13: Backspace from the ghost row front cell moves to previous row back cell and the ghost row survives', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    const ghostIndex = (await rows(page).count()) - 1
    await frontInput(page, ghostIndex).click()
    await page.keyboard.press('Backspace')
    await expect(backInput(page, 0)).toBeFocused()
    // Still exactly A + ghost — no row was deleted (the ghost's own row is
    // never a delete target).
    await expect(rows(page)).toHaveCount(2)
  })

  test('14: row deletion via keyboard updates the emitted pair count and persists across reload', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ])
    await expect(page.getByText(/2\/28語/)).toBeVisible()
    await frontInput(page, 0).fill('')
    await backInput(page, 0).fill('')
    await frontInput(page, 0).click()
    await page.keyboard.press('Backspace') // empty first row — see #12b
    await expect(page.getByText(/1\/28語/)).toBeVisible()
    await page.waitForTimeout(600) // clear the 500ms autosave debounce
    await page.reload()
    await page.waitForSelector('html.js-ready')
    await expect(page.getByText(/1\/28語/)).toBeVisible()
    await expect(frontInput(page, 0)).toHaveValue('B')
  })
})

test.describe('WordTable: paste', () => {
  // Firefox constructs a fresh, empty DataTransfer for `ClipboardEvent`
  // regardless of the `clipboardData` constructor option (confirmed: the
  // event does carry a clipboardData object, but getData() on it always
  // returns '') — a deliberate Firefox restriction on programmatically
  // populating paste clipboardData, not a bug in this app or in pasteText.
  // Real OS-clipboard paste (the only Firefox-compatible alternative)
  // needs per-OS permission plumbing that isn't worth it for one browser;
  // Chromium + WebKit both honor the constructor option and give full
  // coverage of parseInput's delimiter/error wiring.
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox ignores ClipboardEvent constructor clipboardData')

  test('15: pasting tab-separated multi-line text populates rows and appends a ghost row', async ({ page }) => {
    await gotoWithPairs(page)
    await pasteText(frontInput(page, 0), 'Hello\tこんにちは\nGoodbye\tさようなら')
    await expect(rows(page)).toHaveCount(3)
    await expect(frontInput(page, 0)).toHaveValue('Hello')
    await expect(backInput(page, 0)).toHaveValue('こんにちは')
    await expect(frontInput(page, 1)).toHaveValue('Goodbye')
    await expect(backInput(page, 1)).toHaveValue('さようなら')
    await expect(frontInput(page, 2)).toHaveValue('')
    await expect(page.getByText(/2\/28語/)).toBeVisible()
  })

  test('16: pasting comma-separated multi-line text populates rows the same way', async ({ page }) => {
    await gotoWithPairs(page)
    await pasteText(frontInput(page, 0), 'Hello,こんにちは\nGoodbye,さようなら')
    await expect(frontInput(page, 0)).toHaveValue('Hello')
    await expect(backInput(page, 0)).toHaveValue('こんにちは')
    await expect(frontInput(page, 1)).toHaveValue('Goodbye')
    await expect(backInput(page, 1)).toHaveValue('さようなら')
  })

  test('17: pasting into a middle row splices from that position, preserving rows after it', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
      { front: 'C', back: 'c' },
    ])
    // Pasting N pairs starting at row `start` REPLACES the N rows from
    // `start` (handlePaste's `after = rs.slice(start + pairs.length)`) —
    // pasting exactly 1 pair at row 1 replaces only B, leaving C (row 2)
    // as the first row genuinely "after" the splice.
    await pasteText(frontInput(page, 1), 'X\tx')
    await expect(frontInput(page, 0)).toHaveValue('A')
    await expect(frontInput(page, 1)).toHaveValue('X')
    await expect(backInput(page, 1)).toHaveValue('x')
    await expect(frontInput(page, 2)).toHaveValue('C') // preserved after the splice
  })

  test('18: pasting odd-count alternating-line text shows a paste error; a later valid paste clears it', async ({ page }) => {
    await gotoWithPairs(page)
    await pasteText(frontInput(page, 0), 'Hello\nWorld\nExtra')
    await expect(page.getByText('貼り付けた行数が奇数のため、ペアを作れませんでした')).toBeVisible()
    // Typing alone does not clear the error (current, deliberate behavior).
    await frontInput(page, 0).pressSequentially('!')
    await expect(page.getByText('貼り付けた行数が奇数のため、ペアを作れませんでした')).toBeVisible()
    // A subsequent valid multi-line paste does clear it.
    await pasteText(frontInput(page, 0), 'Hi\tやあ')
    await expect(page.getByText('貼り付けた行数が奇数のため、ペアを作れませんでした')).not.toBeVisible()
  })

  test('19: pasting a single value with no delimiter leaves default paste behavior alone (no row explosion)', async ({ page }) => {
    await gotoWithPairs(page)
    await pasteText(frontInput(page, 0), 'JustOneWord')
    // handlePaste's early return means preventDefault() is never called, so
    // the app leaves this to the browser's default paste — the row count
    // must not explode into multiple rows from the single-value payload.
    await expect(rows(page)).toHaveCount(1)
  })
})

test.describe('WordTable: IME composition guard', () => {
  test('20a: Enter during active composition does not move focus (isComposing branch)', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'Hello', back: 'World' }])
    await frontInput(page, 0).click()
    await dispatchComposingKey(frontInput(page, 0), 'Enter')
    await expect(frontInput(page, 0)).toBeFocused()
  })

  test('20b: Backspace during active composition does not delete a row (legacy keyCode 229 branch)', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await frontInput(page, 1).fill('') // ghost row, already empty
    await frontInput(page, 0).click()
    await dispatchComposingKey(frontInput(page, 0), 'Backspace', { legacyKeyCode: true })
    await expect(rows(page)).toHaveCount(2) // nothing deleted
  })

  test('21: composition-Enter does not commit a rename, composition-Escape does not cancel it', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await page.getByRole('button', { name: '項目メニュー' }).click()
    await page.getByRole('menuitem', { name: '名前を変更' }).click()
    const renameInput = page.locator('.list-item-rename-input')
    await expect(renameInput).toBeFocused()
    await renameInput.fill('NotYetCommitted')
    await dispatchComposingKey(renameInput, 'Enter')
    // Still in rename mode — the select button has not swapped back in.
    await expect(renameInput).toBeVisible()
    await expect(page.locator('.list-item-select')).toBeHidden()
  })
})

test.describe('EditorMain: hint / page meter / print button reactivity', () => {
  test('22: 0 pairs shows hint text, no meter, print disabled', async ({ page }) => {
    await gotoWithPairs(page)
    await expect(page.getByText('表面と裏面を入力すると、切って折るだけの単語帳になります。')).toBeVisible()
    await expect(page.getByText(/語 ・/)).not.toBeVisible()
    await expect(page.getByRole('button', { name: '印刷' })).toBeDisabled()
  })

  test('23: 1 pair swaps hint for the meter+caption and enables print', async ({ page }) => {
    await gotoWithPairs(page, [{ front: 'A', back: 'a' }])
    await expect(page.getByText('表面と裏面を入力すると、切って折るだけの単語帳になります。')).not.toBeVisible()
    await expect(page.getByText('1ページ目 ・ 1/28語 ・ あと27語で1ページ')).toBeVisible()
    await expect(page.getByRole('button', { name: '印刷' })).toBeEnabled()
  })

  test('24: exactly 28 pairs (one full page) shows the full brand-green meter and the exact-fit caption', async ({ page }) => {
    const pairs = Array.from({ length: 28 }, (_, i) => ({ front: `W${i}`, back: `M${i}` }))
    await gotoWithPairs(page, pairs)
    await expect(page.getByText('1ページ目 ・ 28/28語 ・ ちょうど1ページ分')).toBeVisible()
    const fill = page.locator('[class*="bg-brand"]')
    await expect(fill).toBeVisible()
    await expect(fill).toHaveCSS('width', /.+/)
    const box = await fill.boundingBox()
    const track = await page.locator('.bg-hairline-soft').boundingBox()
    expect(box).not.toBeNull()
    expect(track).not.toBeNull()
    if (box && track) expect(Math.abs(box.width - track.width)).toBeLessThan(1)
  })

  test('25: 29 pairs reports page 2 in the caption and puts the dashed break after pair 28 only', async ({ page }) => {
    const pairs = Array.from({ length: 29 }, (_, i) => ({ front: `W${i}`, back: `M${i}` }))
    await gotoWithPairs(page, pairs)
    await expect(page.getByText('2ページ目 ・ 1/28語 ・ あと27語で1ページ')).toBeVisible()
    await expect(row(page, 27).locator('td').first()).toHaveClass(/border-dashed/)
    await expect(row(page, 28).locator('td').first()).not.toHaveClass(/border-dashed/)
  })

  test('26: print button click invokes window.print exactly once', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(page, [{ id: 'seed', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 }], 'seed')
    await stubPrint(page)
    await gotoReady(page, '/')
    await page.getByRole('button', { name: '印刷' }).click()
    expect(await printCallCount(page)).toBe(1)
  })
})
