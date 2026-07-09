'use client'

import { createMemo, createSignal } from '@barefootjs/client'
import { Preview } from './Preview'
import { WordTable } from './WordTable'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import type { Pair } from '../src/lib/types'

export function App() {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [settings] = createSignal(DEFAULTS)

  const layout = createMemo(() => computeLayout(pairs(), settings()))
  // Every element of pageBreakAfterPairIndex marks the last pair of a
  // page, including the very last pair overall — but there's no line to
  // draw after the final row, so that last entry is dropped.
  const breakIndices = createMemo(() => {
    const all = layout().pageBreakAfterPairIndex
    return all.length > 1 ? all.slice(0, -1) : []
  })

  return (
    <div className="app">
      <div className="app-input">
        <WordTable breakIndices={breakIndices()} onChange={setPairs} />
      </div>
      <Preview layout={layout()} settings={settings()} />
    </div>
  )
}
