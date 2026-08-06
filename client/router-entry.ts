/**
 * Client bootstrap for the partial-navigation router. Loaded once per page as a
 * module <script> (see renderer.tsx), bundled by Vite as its own entry
 * (vite.config.ts's `rollupOptions.input` + the barefoot plugin's `assets`
 * option, which resolves the content-hashed URL into dist/bf-assets.ts).
 *
 *   1. setupStreaming() installs the client-runtime seams the router
 *      re-hydrates / disposes regions through (window.__bf_hydrate_within /
 *      __bf_dispose_within).
 *   2. startRouter() intercepts same-origin <a> clicks, fetches the ordinary
 *      full-page HTML, and swaps only the [bf-region] content — page
 *      transitions keep the shell, stylesheets, and scroll, with no full
 *      reload.
 *
 * @barefootjs/client resolves to the same shared Rollup chunk the compiled
 * islands' entries import, so there is a single reactive runtime instance —
 * no import map involved.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'

setupStreaming()
startRouter()

// Service-worker registration deliberately does NOT live here: this module
// runs after the island scripts, and App's initialize() may have already
// replaceState'd the URL (dropping the ?sw=cache-first debug flag) by
// then. It's an inline <head> script in renderer.tsx instead, which runs
// at parse time, before any island touches the URL.
