import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/components/',
  resolve: {
    // Mirrors tsconfig.json's `@/components/*` path mapping — Vite's
    // dev-server dependency pre-scan parses raw source directly (before
    // the barefoot plugin's own `transform` hook runs) and has no notion
    // of tsconfig `paths` without this. Points at the SOURCE tree (not
    // `dist/components`, the compiled SSR output tsconfig also maps):
    // Vite's client bundler only ever needs to resolve a component
    // import to a real `.tsx` file to bundle, which is always the
    // source one.
    alias: {
      '@/components': resolve(HERE, 'components'),
    },
  },
  // `build.outDir` (`public/components`) is itself a subdirectory of
  // `public/` — Vite's own default `publicDir` behavior would copy
  // `public/`'s OTHER contents (styles.css, sw.js, icons, …) into
  // `public/components` too, which nothing reads (Workers Assets already
  // serves them straight from `public/` itself) and which `emptyOutDir`
  // would then immediately churn on the next build.
  publicDir: false,
  build: {
    outDir: 'public/components',
    emptyOutDir: true,
    rollupOptions: {
      // The router bootstrap is a hand-written entry, not a `'use client'`
      // component, so the barefoot plugin's discovery never adds it —
      // registering it here is what gets it bundled; the plugin's `assets`
      // option below only resolves the URL it was bundled to (see
      // `HonoViteOptions.assets`).
      input: { 'router-entry': resolve(HERE, 'client/router-entry.ts') },
    },
  },
  plugins: barefoot({
    // Compiled SSR templates land in `dist/components` — a backend source
    // directory wrangler's own bundler imports via tsconfig's
    // `@/components/*` mapping, never served over HTTP.
    components: ['components'],
    templates: 'dist/components',
    // Exposes the bundled router-entry URL (dev: vite-origin; build:
    // content-hashed) to renderer.tsx as `Assets.routerEntry` via the
    // generated `dist/bf-assets.ts`.
    assets: { routerEntry: 'client/router-entry.ts' },
  }),
})
