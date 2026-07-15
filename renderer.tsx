import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap, BfScripts } from '@barefootjs/hono/app'
import manifest from './public/components/manifest.json' with { type: 'json' }
import { messages } from './src/lib/i18n'
import type { Locale } from './src/lib/i18n'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string; locale?: string }): Response
  }
}

const componentsBase = '/components'

export const renderer = jsxRenderer(({ children, title, locale }) => {
  const loc: Locale = locale === 'en' ? 'en' : 'ja'
  const t = messages[loc]
  return (
    <html lang={loc}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? t.title}</title>
        <meta name="description" content={t.metaDescription} />
        <meta property="og:title" content={title ?? t.title} />
        <meta property="og:description" content={t.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sora.piconic.ai/" />
        <meta property="og:site_name" content="Sora" />
        <meta property="og:image" content="https://sora.piconic.ai/og.png" />
        <meta property="og:locale" content={loc === 'ja' ? 'ja_JP' : 'en_US'} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {/* Link every sheet directly so the browser fetches them in
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
            usage-tracked) — a usage-tracking collector can miss components
            that are only ever mounted client-side (e.g. inside a signal-
            driven `.map()` that starts empty), since they're never present
            in the initial SSR output. */}
        <BfScripts base={componentsBase} manifest={manifest} />
      </body>
    </html>
  )
})
