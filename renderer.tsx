import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap, BfScripts } from '@barefootjs/hono/app'
import manifest from './public/components/manifest.json' with { type: 'json' }
import { messages } from './src/lib/i18n'
import type { Locale } from './src/lib/i18n'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string; locale?: string; path?: string }): Response
  }
}

const componentsBase = '/components'
const origin = 'https://sora.piconic.ai'

// `hreflang` isn't in hono/jsx's <link> attribute types — spread it from a
// record, same workaround as the popover attributes in AppHeader.tsx.
const hreflang = (value: string): Record<string, string> => ({ hreflang: value })

export const renderer = jsxRenderer(({ children, title, locale, path }) => {
  const loc: Locale = locale === 'en' ? 'en' : 'ja'
  const t = messages[loc]
  // Machine-readable page summary for search engines ("this is a free
  // educational web app"). dangerouslySetInnerHTML because JSX text
  // escaping would turn the JSON's quotes into &quot;.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Sora',
    url: `${origin}${path ?? '/'}`,
    description: t.metaDescription,
    inLanguage: loc,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: loc === 'ja' ? 'JPY' : 'USD' },
  })
  return (
    <html lang={loc}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? t.title}</title>
        <meta name="description" content={t.metaDescription} />
        {/* `path` marks a crawlable page (`/ja`, `/en` — see server.tsx):
            those get canonical + hreflang alternates, with the negotiated
            `/` redirect as x-default. Pathless renders (`/l/:id`) are
            per-device list state and are kept out of the index. */}
        {path ? (
          <>
            <link rel="canonical" href={`${origin}${path}`} />
            <link rel="alternate" {...hreflang('ja')} href={`${origin}/ja`} />
            <link rel="alternate" {...hreflang('en')} href={`${origin}/en`} />
            <link rel="alternate" {...hreflang('x-default')} href={`${origin}/`} />
          </>
        ) : (
          <meta name="robots" content="noindex" />
        )}
        <meta property="og:title" content={title ?? t.title} />
        <meta property="og:description" content={t.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${origin}${path ?? '/'}`} />
        <meta property="og:site_name" content="Sora" />
        <meta property="og:image" content={`${origin}/og.png`} />
        <meta property="og:locale" content={loc === 'ja' ? 'ja_JP' : 'en_US'} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {/* PWA installability (Chrome/Edge "install app", Safari "Add to
            Dock") — offline behavior itself lives in public/sw.js. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#ffffff" />
        {/* Service-worker boot. Inline in <head>, not in router-entry.js:
            it must read location.search at parse time — App's initialize()
            replaceStates the URL to /l/:id soon after hydration, which
            would strip the ?sw=cache-first debug flag before a body-end
            module ever saw it. The controllerchange reload heals the
            post-deploy window where a page rendered from the old snapshot
            is taken over by the new worker (skipWaiting + claim in sw.js);
            the hadController guard keeps a first-ever install (claim on a
            previously uncontrolled page) from reloading a first visit. */}
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "if ('serviceWorker' in navigator) {",
              "  var swUrl = location.search.indexOf('sw=cache-first') !== -1 ? '/sw.js?cache-first' : '/sw.js'",
              '  navigator.serviceWorker.register(swUrl)["catch"](function () {})',
              '  var hadController = Boolean(navigator.serviceWorker.controller)',
              "  navigator.serviceWorker.addEventListener('controllerchange', function () {",
              '    if (hadController) location.reload()',
              '    hadController = true',
              '  })',
              '}',
            ].join('\n'),
          }}
        />
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
        {/* The single [bf-region] the client router swaps between routes
            (@barefootjs/router). The whole per-route subtree is the region;
            the shell (head, scripts, router boot) stays mounted across a
            navigation. Hand-written as a plain attribute because this Hono
            template isn't bf-compiled, so <Region> wouldn't lower here. */}
        <div bf-region="content">{children}</div>
        {/* Emits a <script> for every manifest entry unconditionally (not
            usage-tracked) — a usage-tracking collector can miss components
            that are only ever mounted client-side (e.g. inside a signal-
            driven `.map()` that starts empty), since they're never present
            in the initial SSR output. */}
        <BfScripts base={componentsBase} manifest={manifest} />
        {/* Boots the partial-navigation router (client/router-entry.ts). After
            BfScripts so the island runtime/import map is in place first. */}
        <script type="module" src={`${componentsBase}/router-entry.js`} />
      </body>
    </html>
  )
})
