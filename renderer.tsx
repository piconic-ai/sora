import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap, BfScripts } from '@barefootjs/hono/app'
import manifest from './public/components/manifest.json' with { type: 'json' }

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string }): Response
  }
}

const componentsBase = '/components'

export const renderer = jsxRenderer(({ children, title }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title ?? 'BarefootJS app'}</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      {/* Link all three sheets so the browser fetches them in
          parallel — chaining via styles.css @import would defer
          tokens/uno to a second round-trip and flash unstyled DOM.
          tokens.css first so CSS variables are defined before any
          rule references them. */}
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/styles.css" />
      <link rel="stylesheet" href="/uno.css" />
      <link rel="stylesheet" href="/app.css" />
      <link rel="stylesheet" href="/print.css" />
      <BfImportMap base={componentsBase} />
    </head>
    <body>
      {children}
      {/* Emits a <script> for every manifest entry unconditionally (not
          usage-tracked) — required because Sheet is only ever mounted
          client-side inside Preview's dynamic `.map()` and is never
          present in the initial SSR when the input is empty, so a
          usage-tracking script collector would never load it. */}
      <BfScripts base={componentsBase} manifest={manifest} />
    </body>
  </html>
))
