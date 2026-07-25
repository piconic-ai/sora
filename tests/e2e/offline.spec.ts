import type { Page } from '@playwright/test'
import { test, expect, gotoReady, waitForHydration, setLocale, clearSoraDb, seedLists } from './fixtures'

// public/sw.js — offline support. The worker is network-first, so every
// other spec exercises the "online, worker transparent" path implicitly;
// this spec covers the one behavior that exists only when the network is
// gone: serving the app (shell + assets) from the cache.

/**
 * Waits until the CURRENT page is controlled by the worker, not merely
 * until one is active: `serviceWorker.ready` can resolve before the
 * activate handler's clients.claim() lands, and a reload issued in that
 * window loads uncontrolled — its requests bypass the worker entirely
 * (which is exactly the flake this helper exists to prevent). Polls
 * because claim gives no dedicated page-side event to await; the
 * resolved registration is also not serializable, hence the boolean.
 */
async function waitForControl(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const check = () => (navigator.serviceWorker.controller ? resolve(true) : setTimeout(check, 50))
        void navigator.serviceWorker.ready.then(check)
      }),
  )
}

test.describe('Offline (service worker)', () => {
  test('87: the app loads and edits work offline after one online visit', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'setOffline + service workers are only reliable in Chromium under Playwright')

    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await seedLists(page, [{ id: 'seed', pairs: [{ front: 'Offline', back: 'オフライン' }], createdAt: 1000 }], 'seed')
    await gotoReady(page, '/')

    // The first load races the worker's registration: its own HTML wasn't
    // served through the worker. Wait until the page is controlled, then
    // reload once online so the current URL (/l/seed after the app's
    // replaceState) passes through the worker and lands in the cache.
    await waitForControl(page)
    await page.reload()
    await waitForHydration(page)

    await context.setOffline(true)
    await page.reload()
    await waitForHydration(page)

    // The list comes from IndexedDB and the shell from the cache — the
    // full editor must work, not just render.
    const front = page.locator('.word-table tbody tr').first().locator('input').first()
    await expect(front).toHaveValue('Offline')
    await front.fill('StillWorks')
    await expect(front).toHaveValue('StillWorks')

    await context.setOffline(false)
  })

  test('88: ?sw=cache-first serves assets from the cache snapshot (production strategy)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'service workers are only reliable in Chromium under Playwright')

    await setLocale(page, 'ja')
    await clearSoraDb(page)
    await gotoReady(page, '/ja?sw=cache-first')
    await waitForControl(page)

    // Prove the strategy, not the plumbing: plant a marker response in the
    // snapshot cache and fetch the same URL through the worker. Only the
    // cache-first branch returns the marker while ONLINE — network-first
    // (the localhost default this flag overrides) would return the real
    // stylesheet. Asserting via resource timing instead proved flaky:
    // Chromium's memory cache sits in front of the worker on reloads.
    const body = await page.evaluate(async () => {
      const keys = await caches.keys()
      const cache = await caches.open(keys[0])
      await cache.put('/app.css', new Response('/* from-cache-storage */', { headers: { 'Content-Type': 'text/css' } }))
      const res = await fetch('/app.css')
      return res.text()
    })
    expect(body).toContain('from-cache-storage')
  })
})
