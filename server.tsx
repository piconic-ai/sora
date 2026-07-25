import type { Context } from 'hono'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { renderer } from './renderer'
import { App } from '@/components/App'
import { resolveLocale, messages } from './src/lib/i18n'
import type { Locale } from './src/lib/i18n'

const app = new Hono()

app.use('*', renderer)

function negotiatedLocale(c: Context): Locale {
  return resolveLocale(getCookie(c, 'locale'), c.req.header('accept-language'))
}

// Same app shell for `/ja`, `/en`, and `/l/:id` — the list state is entirely
// client-driven, so the `:id` param is never read here. The client reads it
// from `location.pathname` on mount (see components/App.tsx's initialize)
// to pick which saved list to open; an unknown/missing id there just falls
// back to the default active list.
//
// `path` is the crawlable canonical path of this render (`/ja`, `/en`).
// It drives canonical/hreflang/og:url in renderer.tsx; list URLs pass none
// and get noindex instead — they are per-device state, not public pages.
function renderShell(c: Context, locale: Locale, path?: string) {
  return c.render(
    <main className="print-root">
      <App locale={locale} />
    </main>,
    { title: messages[locale].title, locale, path },
  )
}

// Locale lives in the path (`/ja`, `/en`), not in content negotiation:
// Googlebot crawls without a `ja` Accept-Language, so a single negotiated
// URL would only ever get its English side indexed. The bare `/` is a
// per-user 302 to the visitor's language and doubles as the hreflang
// x-default target.
app.get('/', (c) => c.redirect(`/${negotiatedLocale(c)}`, 302))
app.get('/ja', (c) => renderShell(c, 'ja', '/ja'))
app.get('/en', (c) => renderShell(c, 'en', '/en'))
app.get('/l/:id', (c) => renderShell(c, negotiatedLocale(c)))

// The former standalone how-to page — its content now lives in the how-to
// modal on the top page (components/AppHeader.tsx), so old links land there.
app.get('/how-to', (c) => c.redirect(`/${negotiatedLocale(c)}`, 302))

export default app
