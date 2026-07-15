import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  // Project layout — read by `bf add`, `search`, `meta:extract`, etc.
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
  // Build inputs and output. barefoot mirrors the input dir under
  // `outDir`, so `components/` lands at `public/components/` —
  // exactly where Workers Assets serves it from.
  components: ['components'],
  outDir: 'public',
  scriptBasePath: '/components/',
  // Bundle the client router bootstrap (client/router-entry.ts) to
  // public/components/router-entry.js — @barefootjs/router + its @barefootjs/
  // shared dep are bundled in; @barefootjs/client* stays external (resolved
  // via the page import map to barefoot.js). Loaded as a module <script> in
  // renderer.tsx.
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: '/components/',
    barefootJsPath: '/components/barefoot.js',
  },
})
