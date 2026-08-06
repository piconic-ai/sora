import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'
import { Assets } from './dist/bf-assets'
import { messages } from './src/lib/i18n'
import type { Locale } from './src/lib/i18n'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string; locale?: string; path?: string }): Response
  }
}

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
        {/* The installed-app name must be the bare wordmark: the manifest
            name and this Safari-specific meta are what the Dock / menu bar
            show, and the page <title>'s "— そらで覚える" catch reads as
            clutter there. The <title> keeps the catch for search results. */}
        <meta name="apple-mobile-web-app-title" content="Sora" />
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
      </head>
      <body>
        {/* The single [bf-region] the client router swaps between routes
            (@barefootjs/router). The whole per-route subtree is the region;
            the shell (head, scripts, router boot) stays mounted across a
            navigation. Hand-written as a plain attribute because this Hono
            template isn't bf-compiled, so <Region> wouldn't lower here. */}
        <div bf-region="content">{children}</div>
        {/* No `manifest`/`base` props (and no import map above): under the
            Vite build each SSR'd component's compiled template bakes in its
            own bundled entry URL, and that entry statically imports every
            child island's chunk — Rollup output is self-contained, so a
            component only ever mounted client-side (e.g. inside a signal-
            driven `.map()` that starts empty) still ships via its parent's
            import graph. BfScripts also emits `<link rel="modulepreload">`
            for the transitive shared chunks (sw.js's precache reads those
            URLs out of this HTML). */}
        <BfScripts />
        {/* Boots the partial-navigation router (client/router-entry.ts),
            bundled by Vite as its own entry (vite.config.ts) — Assets maps
            it to the content-hashed (dev: vite-origin) URL. After BfScripts
            so the island runtime is in place first. */}
        <script type="module" src={Assets.routerEntry} />
      </body>
    </html>
  )
})
