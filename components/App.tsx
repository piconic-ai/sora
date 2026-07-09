'use client'

import { createMemo, createSignal } from '@barefootjs/client'
import { Preview } from './Preview'
import { parseInput } from '../src/lib/parse'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'

export function App() {
  const [rawText, setRawText] = createSignal('')
  const [settings] = createSignal(DEFAULTS)

  const parsed = createMemo(() => parseInput(rawText()))
  const pairs = createMemo(() => parsed().pairs)
  const parseError = createMemo(() => parsed().error)
  const layout = createMemo(() => computeLayout(pairs(), settings()))

  return (
    <div className="app">
      <div className="app-input">
        <textarea
          className="raw-input"
          placeholder="表面,裏面 の形式で1行1組ずつ入力（タブ/カンマ区切り、または表面・裏面を1行おきに交互）"
          onInput={(e) => setRawText((e.target as HTMLTextAreaElement).value)}
        />
        {parseError() && <p className="input-error">{parseError()}</p>}
      </div>
      <Preview layout={layout()} settings={settings()} />
    </div>
  )
}
