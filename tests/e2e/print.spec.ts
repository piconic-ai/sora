import type { Page } from '@playwright/test'
import { test, expect, gotoReady, setLocale, clearSoraDb, seedLists } from './fixtures'

// components/PrintSheets.tsx + public/print.css — the pairs -> pages ->
// bands -> panels -> physical mm-sized sheet pipeline. computeLayout/
// computeSheetGeometry/computePageFill/fitFontSizePt are unit-tested
// (tests/layout.test.ts, sheetGeometry.test.ts, pageMeter.test.ts,
// fit.test.ts) — these own the CSS-under-@media-print reality and the DOM
// structure PrintSheets.tsx produces, including the exact regression this
// session shipped and then had to fix: print.css's `body > *:not(.print-
// root)` rule matched renderer.tsx's `[bf-region]` router wrapper (since
// .print-root sits *inside* it, not as body's direct child) and hid the
// entire printable page. Fixed with a `:has()`-based rule in the previous
// commit; case 62 below is the direct regression test for it.
//
// Geometry reference (DEFAULTS: bands=4, panelHeightMm=20, marginMm=0 —
// src/lib/constants.ts): pairsPerPage=28, panelsPerBand=14. Sheet mm ->
// CSS px at 96dpi: 210mm=793.7px, 297mm=1122.5px. computeSheetGeometry
// gives bandWidth=52.5mm, gridTop=8.5mm, cutBands=[52.5,105,157.5],
// foldRows[0..14]=8.5+i*20 (8.5..288.5) — 3 cutBands x 15 foldRows = 45
// fold-guide dots, first at (52.5, 8.5).

async function gotoWithPairs(page: Page, pairs: { front: string; back: string }[], id = 'seed'): Promise<void> {
  await setLocale(page, 'ja')
  await clearSoraDb(page)
  await seedLists(page, [{ id, pairs, createdAt: 1000 }], id)
  await gotoReady(page, '/')
}

function makePairs(n: number): { front: string; back: string }[] {
  return Array.from({ length: n }, (_, i) => ({ front: `W${i}`, back: `M${i}` }))
}

test.describe('The regression that shipped', () => {
  test('62: under print emulation, every ancestor of .print-root up to <body> stays visible, and .sheet actually renders', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    await page.emulateMedia({ media: 'print' })

    const chain = await page.evaluate(() => {
      const results: { tag: string; display: string }[] = []
      let el: Element | null = document.querySelector('.print-root')
      while (el && el !== document.documentElement.parentElement) {
        results.push({ tag: el.tagName, display: getComputedStyle(el).display })
        el = el.parentElement
      }
      return results
    })
    // Every ancestor (including the [bf-region] router wrapper — the exact
    // element the shipped bug hid) must not be display:none. Walking the
    // whole chain rather than checking known wrapper names specifically is
    // deliberate: the failure mode was "a wrapper we forgot to account
    // for" — a future wrapper insertion should be caught the same way.
    for (const node of chain) {
      expect(node.display, `${node.tag} must not be display:none under print`).not.toBe('none')
    }

    const sheetBox = await page.locator('.sheet').boundingBox()
    expect(sheetBox).not.toBeNull()
    expect(sheetBox?.width ?? 0).toBeGreaterThan(0)
    expect(sheetBox?.height ?? 0).toBeGreaterThan(0)
    await page.emulateMedia({ media: 'screen' })
  })

  test('63: under print emulation, screen-only chrome is hidden and only the print sheets remain', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('header').first()).toBeHidden()
    await expect(page.locator('.workspace')).toBeHidden()
    await expect(page.locator('#sora-info')).toBeHidden()
    await expect(page.locator('.print-sheets')).toBeVisible()
    await page.emulateMedia({ media: 'screen' })
  })

  test('64: under screen media, .print-sheets stays hidden (the inverse leak)', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    await expect(page.locator('.print-sheets')).toBeHidden()
  })
})

test.describe('Sheet structure & counts', () => {
  // Three separate tests (not one test re-seeding the same page three
  // times): clearSoraDb/seedLists guard themselves to fire once per page
  // (see fixtures.ts — needed so a test's own page.reload() doesn't
  // re-seed over data the app just wrote), which means a *second*
  // gotoWithPairs call on the same page within one test is a no-op. Each
  // pair count gets its own fresh page instead.
  test('65a: 28 pairs (one full page) -> exactly 1 sheet', async ({ page }) => {
    await gotoWithPairs(page, makePairs(28))
    await expect(page.locator('.sheet')).toHaveCount(1)
    await expect(page.getByText('1ページ目')).toBeVisible()
  })

  test('65b: 29 pairs (one over) -> exactly 2 sheets', async ({ page }) => {
    await gotoWithPairs(page, makePairs(29))
    await expect(page.locator('.sheet')).toHaveCount(2)
    await expect(page.getByText('2ページ目')).toBeVisible()
  })

  test('65c: 57 pairs (two over two pages) -> exactly 3 sheets', async ({ page }) => {
    await gotoWithPairs(page, makePairs(57))
    await expect(page.locator('.sheet')).toHaveCount(3)
    await expect(page.getByText('3ページ目')).toBeVisible()
  })

  test('66: panel content order — band 1 holds pairs 0-6 interleaved front/back, band 2 starts at pair 7', async ({ page }) => {
    await gotoWithPairs(page, [
      { front: 'Hello', back: 'こんにちは - Konnichiwa' },
      ...makePairs(27).slice(1),
    ])
    const sheet = page.locator('.sheet').first()
    const band1 = sheet.locator('.band').nth(0)
    const band1Panels = await band1.locator('.panel').allTextContents()
    expect(band1Panels[0]).toBe('Hello')
    expect(band1Panels[1]).toBe('こんにちは - Konnichiwa')
    expect(band1Panels[2]).toBe('W1')
    expect(band1Panels[3]).toBe('M1')
    // 7 pairs (14 panels) per band; band 2 starts at pair index 7.
    expect(band1Panels).toHaveLength(14)
    const band2Panels = await sheet.locator('.band').nth(1).locator('.panel').allTextContents()
    expect(band2Panels[0]).toBe('W7')
    expect(band2Panels[1]).toBe('M7')
  })

  test('67: a partial last page reserves empty (hidden) panels for the remainder', async ({ page }) => {
    await gotoWithPairs(page, makePairs(29))
    const sheet2 = page.locator('.sheet').nth(1)
    const band1 = sheet2.locator('.band').nth(0)
    await expect(band1.locator('.panel').nth(0)).toHaveText('W28')
    await expect(band1.locator('.panel').nth(1)).toHaveText('M28')
    await expect(band1.locator('.panel.empty')).not.toHaveCount(0)
    // visibility:hidden (reserves layout space), not display:none.
    await expect(band1.locator('.panel.empty').first()).toBeHidden()
  })
})

test.describe('Physical sizing (mm reality)', () => {
  test('68: sheet bounding box is ~210mm x 297mm (793.7px x 1122.5px at 96dpi)', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    await page.emulateMedia({ media: 'print' })
    const box = await page.locator('.sheet').boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(Math.abs(box.width - 793.7)).toBeLessThan(1)
      expect(Math.abs(box.height - 1122.5)).toBeLessThan(1)
    }
    await page.emulateMedia({ media: 'screen' })
  })

  test('69: panel height is ~20mm and .bands has 4 equal-width columns of ~52.5mm', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    await page.emulateMedia({ media: 'print' })
    const panelBox = await page.locator('.panel').first().boundingBox()
    expect(panelBox).not.toBeNull()
    if (panelBox) expect(Math.abs(panelBox.height - 75.59)).toBeLessThan(1)

    const bandBoxes = await page.locator('.band').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
    expect(bandBoxes).toHaveLength(4)
    for (const w of bandBoxes) expect(Math.abs(w - 198.43)).toBeLessThan(1) // 52.5mm
    await page.emulateMedia({ media: 'screen' })
  })

  test('70: the fold-guide marks SVG carries the expected dot count/viewBox/first-dot position', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    const marks = page.locator('.sheet').first().locator('svg.marks')
    await expect(marks).toHaveAttribute('viewBox', '0 0 210 297')
    const circles = marks.locator('circle')
    // 3 cutBands x 15 foldRows (panelsPerBand=14 -> 15 fold lines).
    await expect(circles).toHaveCount(45)
    const first = await circles.first().evaluate((el) => ({
      cx: el.getAttribute('cx'),
      cy: el.getAttribute('cy'),
      r: el.getAttribute('r'),
    }))
    expect(Number(first.cx)).toBeCloseTo(52.5, 1)
    expect(Number(first.cy)).toBeCloseTo(8.5, 1)
    expect(Number(first.r)).toBeCloseTo(0.4, 1)
  })

  test('71: the marks SVG carries preserveAspectRatio="none"', async ({ page }) => {
    await gotoWithPairs(page, makePairs(1))
    const marks = page.locator('.sheet').first().locator('svg.marks')
    await expect(marks).toHaveAttribute('preserveAspectRatio', 'none')
  })
})

test.describe('Page breaks & overflow', () => {
  test('72: every sheet but the last has break-after:page under print; the last has auto', async ({ page }) => {
    await gotoWithPairs(page, makePairs(57)) // 3 sheets
    await page.emulateMedia({ media: 'print' })
    const sheets = page.locator('.sheet')
    await expect(sheets).toHaveCount(3)
    const breaks = await sheets.evaluateAll((els) => els.map((el) => getComputedStyle(el).breakAfter))
    expect(breaks[0]).toBe('page')
    expect(breaks[1]).toBe('page')
    expect(breaks[2]).toBe('auto')
    await page.emulateMedia({ media: 'screen' })
  })

  test('73: long text gets a fitted inline font-size; short text carries no inline style', async ({ page }) => {
    const longText = 'あ'.repeat(40)
    await gotoWithPairs(page, [{ front: longText, back: 'x' }, ...makePairs(27)])
    const sheet = page.locator('.sheet').first()
    const longPanel = sheet.locator('.panel').filter({ hasText: longText }).first()
    const style = await longPanel.getAttribute('style')
    expect(style).toMatch(/font-size:\s*\d+(\.\d+)?pt/)
    const fittedPt = Number(style?.match(/font-size:\s*([\d.]+)pt/)?.[1])
    expect(fittedPt).toBeLessThan(14)

    const shortPanel = sheet.locator('.panel').filter({ hasText: 'W1' }).first()
    expect(await shortPanel.getAttribute('style')).toBeFalsy()
  })

  test('74: page.pdf() produces the actual expected page count (29 pairs -> 2 A4 pages)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf() is Chromium-only')
    await gotoWithPairs(page, makePairs(29))
    const pdf = await page.pdf({ format: 'A4', margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    // Minimal, dependency-free PDF page-count check: count "/Type /Page"
    // object occurrences (excludes "/Type /Pages", the tree root, via the
    // trailing space+slash boundary) rather than pulling in a PDF parser.
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    expect(pageCount).toBe(2)
  })
})

test.describe('Print states', () => {
  test('75: an empty list disables print and emits zero sheets under print emulation', async ({ page }) => {
    await gotoWithPairs(page, [])
    await expect(page.getByRole('button', { name: '印刷' })).toBeDisabled()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.sheet')).toHaveCount(0)
    await page.emulateMedia({ media: 'screen' })
  })

  test('76: print output stays correct after switching lists', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [
        { id: 'list-a', pairs: makePairs(1), createdAt: 1000 },
        { id: 'list-b', pairs: [{ front: 'Switched', back: 'こんにちは' }], createdAt: 2000 },
      ],
      'list-a',
    )
    await gotoReady(page, '/')
    await page.getByRole('button', { name: /Switched/ }).click()
    await expect(page.locator('.word-table tbody tr').first().locator('input').first()).toHaveValue('Switched')
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.sheet .panel').first()).toHaveText('Switched')
    await page.emulateMedia({ media: 'screen' })
  })
})
