/*
 * Offline support + fast repeat visits.
 *
 * Versioned-snapshot model: VERSION below is stamped by
 * scripts/stamp-sw.mjs (run from `npm run build` / `deploy`) with a hash
 * of the served assets. A deploy that changes any asset changes this
 * file's bytes, which makes the browser install a fresh worker: it
 * precaches the new snapshot under a new cache name, activation deletes
 * the old one, and the page reloads itself once (see router-entry.ts's
 * controllerchange handler) so HTML and assets never stay mixed across
 * versions.
 *
 * Strategy, per request:
 * - Navigations (HTML): network-first. The SSR response is where locale
 *   negotiation and new-version detection happen, so it must stay fresh;
 *   the cache is only its offline fallback.
 * - Static assets: cache-first against the current snapshot — this is
 *   what makes repeat visits instant. Safe because the snapshot is
 *   replaced wholesale on version change, never partially updated.
 * - On localhost, everything falls back to network-first: `npm run dev`
 *   rebuilds assets without restamping VERSION, and cache-first would
 *   pin the pre-edit build during development. To try the production
 *   behavior locally anyway, open the app with `?sw=cache-first`
 *   (router-entry.ts then registers this script as /sw.js?cache-first,
 *   and the query opts out of the localhost fallback).
 */

const VERSION = 'ca38e17dd25d'
const CACHE = `sora-${VERSION}`

const FORCED_CACHE_FIRST = self.location.search.includes('cache-first')
const DEV =
  !FORCED_CACHE_FIRST &&
  (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1')

// The app shell: both locale pages plus every static asset the shell
// links (renderer.tsx). Component client JS is NOT listed here — the
// build manifest (components/manifest.json) is server-only (.assetsignore),
// so the install step extracts the /components/*.js URLs from the /ja
// HTML itself, which BfScripts emits a <script> tag per component into.
const PRECACHE = [
  '/ja',
  '/en',
  '/tokens.css',
  '/styles.css',
  '/uno.css',
  '/app.css',
  '/print.css',
  '/favicon.svg',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      let files = PRECACHE
      try {
        const res = await fetch('/ja')
        const html = await res.text()
        const scripts = [...new Set(html.match(/\/components\/[\w.-]+\.js/g) || [])]
        files = PRECACHE.concat(scripts)
      } catch {
        // Shell HTML unreachable mid-install — precache the static list
        // only; runtime caching picks the component JS up on the next
        // controlled page load.
      }
      await cache.addAll(files)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  const useNetworkFirst = DEV || request.mode === 'navigate'
  event.respondWith(useNetworkFirst ? networkFirst(request) : cacheFirst(request))
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && !response.redirected) {
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    // Skip redirected responses (`/` and `/how-to` are locale 302s):
    // replaying a redirected response for a navigation is rejected by the
    // browser, and the redirect *target* (/ja, /en) is cached on its own.
    if (response.ok && !response.redirected) {
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    // Offline navigation to an uncached URL (a fresh /l/:id, or `/` whose
    // redirect was never cached): every page is the same client-driven
    // shell, so serve a cached locale page and let the client restore the
    // list from location.pathname + IndexedDB.
    if (request.mode === 'navigate') {
      const shell = (await cache.match('/ja')) || (await cache.match('/en'))
      if (shell) return shell
    }
    throw err
  }
}
