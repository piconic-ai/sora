'use client'

import { createEffect, createMemo, createSignal } from '@barefootjs/client'
import { PrintSheets } from './PrintSheets'
import { WordTable } from './WordTable'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import { messages, pageMeterCaption } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { computePageFill } from '../src/lib/pageMeter'
import type { Pair } from '../src/lib/types'

interface AppProps {
  locale: string
}

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [locale, setLocale] = createSignal<Locale>((props.locale as Locale) ?? 'ja')

  const layout = createMemo(() => computeLayout(pairs(), DEFAULTS))
  const pageFill = createMemo(() => computePageFill(pairs().length, layout().capacity.pairsPerPage))
  // Every element of pageBreakAfterPairIndex marks the last pair of a
  // page, including the very last pair overall — but there's no line to
  // draw after the final row, so that last entry is dropped.
  const breakIndices = createMemo(() => {
    const all = layout().pageBreakAfterPairIndex
    return all.length > 1 ? all.slice(0, -1) : []
  })

  const t = createMemo(() => messages[locale()])

  // Keeps document.title / html lang in sync with the client-side locale
  // signal (SSR already sets both on first paint; this is what makes them
  // update on a language switch without a full reload) and persists the
  // choice in a cookie so the next SSR request (server.tsx's resolveLocale)
  // picks the same locale.
  createEffect(() => {
    const loc = locale()
    document.title = messages[loc].title
    document.documentElement.lang = loc
    document.cookie = `locale=${loc}; path=/; max-age=31536000; samesite=lax`
  })

  return (
    <div className="app">
      <header className="app-header no-print">
        <h1>Sora</h1>
        <p className="app-tagline">{t().tagline}</p>
        <select
          className="lang-select"
          aria-label="Language"
          value={locale()}
          onChange={(e) => setLocale((e.target as HTMLSelectElement).value as Locale)}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </header>
      <div className="app-input no-print">
        <WordTable breakIndices={breakIndices()} onChange={setPairs} locale={locale()} />
        {pairs().length === 0 ? (
          <p className="hint">{t().hint}</p>
        ) : (
          <div className="page-meter">
            <div className="page-meter-track">
              <div
                className={pageFill().isFull ? 'page-meter-fill is-full' : 'page-meter-fill'}
                style={`width:${Math.round(pageFill().ratio * 100)}%`}
              />
            </div>
            <p className="page-meter-caption">{pageMeterCaption(locale(), pageFill())}</p>
          </div>
        )}
        <button
          type="button"
          className="print-button"
          disabled={layout().pages.length === 0}
          onClick={() => window.print()}
        >
          {t().print}
        </button>
        <details className="howto no-print">
          <summary>{t().howTo}</summary>
          <video src="/howto.webm" controls muted loop />
        </details>
      </div>
      <PrintSheets layout={layout()} settings={DEFAULTS} />
      <footer className="app-footer no-print">
        <a href="https://piconic.ai" target="_blank" rel="noopener">
          {t().madeBy}
        </a>
      </footer>
    </div>
  )
}
