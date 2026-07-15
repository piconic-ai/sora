/**
 * Client bootstrap for the partial-navigation router. Loaded once per page as a
 * module <script> (see renderer.tsx), bundled to public/components/router-entry.js
 * by bf build's `bundleEntries` (barefoot.config.ts).
 *
 *   1. setupStreaming() installs the client-runtime seams the router
 *      re-hydrates / disposes regions through (window.__bf_hydrate_within /
 *      __bf_dispose_within).
 *   2. startRouter() intercepts same-origin <a> clicks, fetches the ordinary
 *      full-page HTML, and swaps only the [bf-region] content — so `/` ↔
 *      `/how-to` transitions keep the shell, stylesheets, and scroll, with no
 *      full reload.
 *
 * @barefootjs/client* is left external in the bundle and resolved through the
 * page's import map to the SAME barefoot.js the compiled islands use, so there
 * is a single reactive runtime instance.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'

setupStreaming()
startRouter()
