import { test, expect, gotoReady, setLocale, clearSoraDb, seedLists, waitForHydration } from './fixtures'

// Cross-cutting regression coverage: console/hydration cleanliness, the
// CSS-cascade-layers gotcha this session's UnoCSS migration ran into (see
// public/app.css's .print-root comment), stylesheet load order,
// @barefootjs/router's partial-navigation round trip (the exact machinery
// whose [bf-region] wrapper caused the print-blank-page regression this
// whole suite exists to guard against), and the info popover.

test.describe('Console/hydration cleanliness', () => {
  test('77: no console errors or pageerrors during initial load and hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')
    // Give any deferred hydration warnings (fired via rAF/microtask) a
    // moment to surface too.
    await page.waitForTimeout(300)

    expect(errors).toEqual([])
  })
})

test.describe('CSS cascade-layers gotcha canary', () => {
  test('78: .print-root stays block/left-aligned — the scaffold main{} rule (unlayered) must not win', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')
    const printRoot = page.locator('.print-root')
    const style = await printRoot.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { display: cs.display, textAlign: cs.textAlign, placeItems: cs.placeItems }
    })
    // styles.css's scaffold `main { display:grid; place-items:center;
    // text-align:center }` (built for the sample Counter's centered
    // layout) is plain *unlayered* CSS. UnoCSS's outputToCssLayers puts
    // utility classes in a named layer, and unlayered CSS always outranks
    // layered CSS regardless of specificity — a utility-class-only
    // .print-root would silently lose to it (this session hit exactly
    // this while migrating .print-root to UnoCSS utilities, caught in a
    // real browser before committing; app.css now keeps .print-root as
    // plain CSS specifically because of this). This test pins the
    // observable outcome so a future re-migration attempt fails loudly
    // instead of just rendering narrower/centered.
    expect(style.display).toBe('block')
    expect(style.textAlign).toBe('left')
    expect(style.placeItems).not.toBe('center')
  })
})

test.describe('Stylesheet load order', () => {
  test('79: all five stylesheets load and --brand resolves to the real token value', async ({ page }) => {
    const responses: Record<string, number> = {}
    page.on('response', (res) => {
      const url = new URL(res.url())
      if (/\/(tokens|styles|uno|app|print)\.css$/.test(url.pathname)) {
        responses[url.pathname] = res.status()
      }
    })
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')

    for (const name of ['tokens', 'styles', 'uno', 'app', 'print']) {
      const entry = Object.entries(responses).find(([path]) => path.endsWith(`/${name}.css`))
      expect(entry, `${name}.css should have loaded`).toBeTruthy()
      expect(entry?.[1]).toBe(200)
    }

    const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())
    expect(brand).toBe('#00b769')
  })
})

test.describe('How-to modal', () => {
  test('80: the how-to modal opens from the header and the lead, and closes', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')

    // `/` is a locale redirect now (server.tsx) — a ja visitor lands on /ja.
    // Checked via the request API (sharing the page's cookies) because the
    // app itself replaceStates the address bar to /l/:id once the active
    // list loads, so page.url() no longer shows the redirect target.
    const redirected = await page.request.get('/')
    expect(redirected.url()).toMatch(/\/ja$/)

    // Header "?" button (aria-label 作り方; exact:true keeps it distinct
    // from the lead's 作り方はこちら trigger).
    await page.getByRole('button', { name: '作り方', exact: true }).click()
    await expect(page.getByRole('heading', { name: '作り方' })).toBeVisible()
    await expect(page.locator('#sora-howto li').first()).toBeVisible()

    // Popover light dismiss: Esc closes it.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '作り方' })).toBeHidden()

    // The lead's inline trigger opens the same modal; × closes it.
    await page.getByRole('button', { name: /作り方はこちら/ }).click()
    await expect(page.getByRole('heading', { name: '作り方' })).toBeVisible()
    await page.getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByRole('heading', { name: '作り方' })).toBeHidden()
  })

  test('81: print still works after opening and closing the how-to modal', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(page, [{ id: 'seed', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 }], 'seed')
    await gotoReady(page, '/')

    await page.getByRole('button', { name: '作り方', exact: true }).click()
    await expect(page.getByRole('heading', { name: '作り方' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('html.js-ready')).toHaveCount(1)
    await expect(page.locator('.word-table tbody tr').first().locator('input').first()).toHaveValue('A')

    await page.emulateMedia({ media: 'print' })
    const sheetBox = await page.locator('.sheet').boundingBox()
    expect(sheetBox).not.toBeNull()
    expect(sheetBox?.width ?? 0).toBeGreaterThan(0)
    const regionDisplay = await page.locator('[bf-region]').evaluate((el) => getComputedStyle(el).display)
    expect(regionDisplay).not.toBe('none')
    await page.emulateMedia({ media: 'screen' })
  })
})

test.describe('Info popover', () => {
  test('82: the "i" popover opens and closes via the Popover API', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/')
    const popover = page.locator('#sora-info')
    await expect(popover).toBeHidden()
    await page.getByRole('button', { name: 'Soraについて' }).click()
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
  })
})

test.describe('Multi-tab', () => {
  test('83: two tabs in one context share IndexedDB with no console warnings', async ({ page, context }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(page, [{ id: 'seed', pairs: [{ front: 'A', back: 'a' }], createdAt: 1000 }], 'seed')
    await gotoReady(page, '/')

    const page2 = await context.newPage()
    const warnings: string[] = []
    page2.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') warnings.push(msg.text())
    })
    await gotoReady(page2, '/')
    await expect(page2.locator('.word-table tbody tr').first().locator('input').first()).toHaveValue('A')

    // Edit in tab A, reload tab B -> B sees A's write. IndexedDB writes
    // from db.ts's fail-soft paths are unit-tested with fake-indexeddb;
    // this just proves two real connections actually coexist.
    const frontA = page.locator('.word-table tbody tr').first().locator('input').first()
    await frontA.fill('FromTabA')
    await page.waitForTimeout(700)
    await page2.reload()
    await waitForHydration(page2)
    await expect(page2.locator('.word-table tbody tr').first().locator('input').first()).toHaveValue('FromTabA')

    expect(warnings).toEqual([])
    await page2.close()
  })
})
