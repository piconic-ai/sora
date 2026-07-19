import { test as base, expect, type Page, type Locator } from '@playwright/test'

// Shared e2e helpers for Sora (components/App.tsx's IndexedDB-backed saved
// lists + WordTable editor + print pipeline). See the "Test infra
// considerations" notes this suite was designed against for the reasoning
// behind each of these.

/**
 * Every aria-label/button text is locale-dependent (see src/lib/i18n.ts).
 * Pinning the locale cookie before first navigation keeps selectors stable
 * regardless of the host machine's Accept-Language.
 *
 * Must be `context.addCookies`, not `document.cookie` via addInitScript:
 * the locale is read server-side (renderer.tsx's resolveLocale) during the
 * very first SSR response, before any page script — including an
 * init-script — has a chance to run. addInitScript only affects requests
 * *after* the page it's injected into starts loading, one navigation too
 * late for the first response's own locale.
 */
export async function setLocale(page: Page, locale: 'ja' | 'en' = 'ja'): Promise<void> {
  await page.context().addCookies([{ name: 'locale', value: locale, domain: 'localhost', path: '/' }])
}

/**
 * `html.js-ready` is set in App.tsx's onMount — the reliable "island is
 * hydrated and interactive" signal. Waiting for it avoids racing
 * initialize()'s async IndexedDB read (a race this suite tests deliberately
 * in one place — see "startup race" — but must avoid by accident everywhere
 * else).
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html.js-ready', { state: 'attached', timeout: 10000 })
}

/** Navigate and wait for hydration in one step — the common case. */
export async function gotoReady(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await waitForHydration(page)
}

/**
 * Wipes the 'sora' IndexedDB database before the app's own module code runs,
 * so the next navigation starts from a genuinely empty history (no
 * auto-seeded sample list). Must be registered via addInitScript *before*
 * calling page.goto().
 *
 * Guarded by a sessionStorage flag so it fires exactly once per page/
 * context: addInitScript re-runs on *every* document load in the page,
 * including a test's own `page.reload()` — without the guard, a reload
 * after the app has written real data (e.g. an autosave) would wipe it
 * right back out from under the very test trying to verify it persisted.
 */
export async function clearSoraDb(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__e2e_db_cleared')) return
    sessionStorage.setItem('__e2e_db_cleared', '1')
    indexedDB.deleteDatabase('sora')
  })
}

export interface SeedList {
  id: string
  pairs: { front: string; back: string }[]
  createdAt: number
  updatedAt?: number
  title?: string
}

/**
 * Writes SavedList records directly into IndexedDB (store 'lists', DB
 * 'sora' v2 — see src/lib/storage/db.ts/schema.ts) and, optionally, the
 * active-list pointer (store 'drafts', key 'active' — src/lib/storage/
 * active.ts), before the app boots. Mirrors serializeList's shape by hand
 * rather than importing app code, since this runs inside
 * page.addInitScript's isolated browser-context closure.
 *
 * Guarded by a sessionStorage flag, same reasoning as clearSoraDb: without
 * it, any test that reloads after seeding would re-seed on every reload
 * too, silently overwriting whatever the app itself had written since —
 * exactly the failure mode a "does it survive a reload" test exists to
 * catch, so this guard is not optional for those tests to be meaningful.
 */
export async function seedLists(page: Page, lists: SeedList[], activeListId?: string): Promise<void> {
  await page.addInitScript((args) => {
    const { lists, activeListId } = args as { lists: SeedList[]; activeListId?: string }
    if (sessionStorage.getItem('__e2e_db_seeded')) return
    sessionStorage.setItem('__e2e_db_seeded', '1')
    const openReq = indexedDB.open('sora', 2)
    openReq.onupgradeneeded = (event) => {
      const db = openReq.result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion
      if (oldVersion < 1) db.createObjectStore('drafts')
      if (oldVersion < 2) {
        const store = db.createObjectStore('lists', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    openReq.onsuccess = () => {
      const db = openReq.result
      const tx = db.transaction(['lists', 'drafts'], 'readwrite')
      const listsStore = tx.objectStore('lists')
      for (const l of lists) {
        listsStore.put({
          v: 1,
          id: l.id,
          pairs: l.pairs,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt ?? l.createdAt,
          ...(l.title ? { title: l.title } : {}),
        })
      }
      if (activeListId) {
        tx.objectStore('drafts').put({ v: 1, activeListId }, 'active')
      }
    }
  }, { lists, activeListId })
}

/** Stubs window.print (a real print dialog hangs headless runs) and exposes
 *  the call count via `window.__printCallCount`. */
export async function stubPrint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { __printCallCount: number }).__printCallCount = 0
    window.print = () => {
      ;(window as unknown as { __printCallCount: number }).__printCallCount++
    }
  })
}

export async function printCallCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __printCallCount?: number }).__printCallCount ?? 0)
}

/**
 * Dispatches synthetic KeyboardEvents that exercise WordTable's/App's IME
 * composition guards (`e.isComposing || (e as {keyCode?: number}).keyCode
 * === 229`) without relying on CDP. Real IME input isn't natively
 * supported by Playwright; this targets exactly the two fields the guard
 * reads, so it faithfully tests the guard even though it doesn't simulate
 * an actual conversion UI.
 */
export async function dispatchComposingKey(
  locator: Locator,
  key: string,
  opts: { legacyKeyCode?: boolean } = {},
): Promise<void> {
  await locator.evaluate(
    (el, { key, legacyKeyCode }) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...(legacyKeyCode ? {} : { isComposing: true }),
      })
      if (legacyKeyCode) {
        Object.defineProperty(event, 'keyCode', { get: () => 229 })
      } else {
        Object.defineProperty(event, 'isComposing', { get: () => true })
      }
      el.dispatchEvent(event)
    },
    { key, legacyKeyCode: opts.legacyKeyCode ?? false },
  )
}

/**
 * Dispatches a synthetic `paste` ClipboardEvent carrying `text`, matching
 * exactly what WordTable's handlePaste listens for. Real OS-clipboard
 * paste needs per-browser permission grants and is flaky in headless CI;
 * this targets the same event/API the handler reads
 * (`e.clipboardData.getData('text')`) directly.
 */
export async function pasteText(locator: Locator, text: string): Promise<void> {
  await locator.evaluate((el, text) => {
    const dt = new DataTransfer()
    dt.setData('text', text)
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
  }, text)
}

export { expect }
export const test = base
