import type { Context } from 'hono'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { renderer } from './renderer'
import { App } from '@/components/App'
import { HowToPage } from '@/components/HowToPage'
import { resolveLocale, messages } from './src/lib/i18n'

const app = new Hono()

app.use('*', renderer)

// Same app shell for `/` and `/l/:id` — the list state is entirely
// client-driven, so the `:id` param is never read here. The client reads it
// from `location.pathname` on mount (see components/App.tsx's initialize)
// to pick which saved list to open; an unknown/missing id there just falls
// back to the default active list.
function renderShell(c: Context) {
  const locale = resolveLocale(getCookie(c, 'locale'), c.req.header('accept-language'))
  return c.render(
    <main className="print-root">
      <App locale={locale} />
    </main>,
    { title: messages[locale].title, locale },
  )
}

// The standalone "how to fold/cut/fold" page (components/HowToPage.tsx),
// linked from the header's "?" button. A static server-rendered page (no
// islands), so it's just a plain c.render with no print-root/no-print
// wrapping to worry about.
function renderHowTo(c: Context) {
  const locale = resolveLocale(getCookie(c, 'locale'), c.req.header('accept-language'))
  return c.render(<HowToPage locale={locale} />, { title: `${messages[locale].howTo} — Sora`, locale })
}

app.get('/', renderShell)
app.get('/l/:id', renderShell)
app.get('/how-to', renderHowTo)

export default app
