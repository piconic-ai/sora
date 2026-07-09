'use client'

import { createMemo, createSignal } from '@barefootjs/client'
import { PrintSheets } from './PrintSheets'
import { WordTable } from './WordTable'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import { messages, summary } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import type { Pair } from '../src/lib/types'

interface AppProps {
  locale: string
}

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])

  const layout = createMemo(() => computeLayout(pairs(), DEFAULTS))
  // Every element of pageBreakAfterPairIndex marks the last pair of a
  // page, including the very last pair overall — but there's no line to
  // draw after the final row, so that last entry is dropped.
  const breakIndices = createMemo(() => {
    const all = layout().pageBreakAfterPairIndex
    return all.length > 1 ? all.slice(0, -1) : []
  })

  const t = messages[(props.locale as Locale) ?? 'ja']

  return (
    <div className="app">
      <header className="app-header no-print">
        <h1>Sora</h1>
        <p className="app-tagline">{t.tagline}</p>
      </header>
      <div className="app-input no-print">
        <WordTable breakIndices={breakIndices()} onChange={setPairs} locale={props.locale} />
        {pairs().length === 0 ? (
          <p className="hint">{t.hint}</p>
        ) : (
          <p className="summary">{summary((props.locale as Locale) ?? 'ja', pairs().length, layout().totalPages)}</p>
        )}
        <button
          type="button"
          className="print-button"
          disabled={layout().pages.length === 0}
          onClick={() => window.print()}
        >
          {t.print}
        </button>
      </div>
      <PrintSheets layout={layout()} settings={DEFAULTS} />
    </div>
  )
}
