import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { renderer } from './renderer'
import { App } from '@/components/App'
import { resolveLocale, messages } from './src/lib/i18n'

const app = new Hono()

app.use('*', renderer)

app.get('/', (c) => {
  const locale = resolveLocale(getCookie(c, 'locale'), c.req.header('accept-language'))
  return c.render(
    <main className="print-root">
      <App locale={locale} />
    </main>,
    { title: messages[locale].title, locale },
  )
})

export default app
