import { Hono } from 'hono'
import { renderer } from './renderer'
import { App } from '@/components/App'

const app = new Hono()

app.use('*', renderer)

app.get('/', (c) =>
  c.render(
    <main className="print-root">
      <App />
    </main>,
    { title: 'Sora — そらで覚える' },
  ),
)

export default app
