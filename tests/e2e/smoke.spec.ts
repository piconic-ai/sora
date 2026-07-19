import { test, expect, gotoReady, setLocale, clearSoraDb, seedLists, stubPrint, printCallCount } from './fixtures'

test.describe('smoke', () => {
  test('app loads, hydrates, and shows the seeded sample list', async ({ page }) => {
    await setLocale(page, 'ja')
    await gotoReady(page, '/')
    await expect(page.locator('.word-table tbody tr').first()).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '表面' })).toBeVisible()
  })

  test('clearSoraDb + seedLists control the starting IndexedDB state', async ({ page }) => {
    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(
      page,
      [{ id: 'seed-1', pairs: [{ front: 'X', back: 'Y' }], createdAt: 1000 }],
      'seed-1',
    )
    await gotoReady(page, '/')
    await expect(page.getByRole('button', { name: /^X/ })).toBeVisible()
    // Exactly one seeded list, not the auto-sample — proves clearSoraDb ran
    // before the app's own "seed sample if empty" check.
    await expect(page.locator('.list-item')).toHaveCount(1)
  })

  test('stubPrint intercepts window.print', async ({ page }) => {
    await setLocale(page, 'ja')
    await stubPrint(page)
    await gotoReady(page, '/')
    await page.getByRole('button', { name: '印刷' }).click()
    expect(await printCallCount(page)).toBe(1)
  })
})
