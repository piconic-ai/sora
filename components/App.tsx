'use client'

import { createEffect, createMemo, createSignal, onMount } from '@barefootjs/client'
import { PrintSheets } from './PrintSheets'
import { WordTable } from './WordTable'
import { computeLayout } from '../src/lib/layout'
import { DEFAULTS } from '../src/lib/constants'
import { historyItemTitle, messages, pageMeterCaption } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { computePageFill } from '../src/lib/pageMeter'
import { clearAllLists, deleteList, listSaved, saveList } from '../src/lib/storage/lists'
import type { SavedList } from '../src/lib/storage/schema'
import type { Pair } from '../src/lib/types'

interface AppProps {
  locale: string
}

// The Popover API attributes (`popover`, `popovertarget`) are standard HTML
// but are not yet in @barefootjs/jsx's attribute types. Spreading them from a
// plain record keeps the JSX type-checking. These must be const object
// literals (not a function call) so the compiler folds them into both the
// SSR and client templates as static attributes; a function-call spread is
// left dynamic and drops out of the client template.
const popoverTarget: Record<string, string> = { popover: 'auto' }
const popoverTrigger: Record<string, string> = { popovertarget: 'sora-info' }
const historyPopoverTarget: Record<string, string> = { popover: 'auto' }
const historyTrigger: Record<string, string> = { popovertarget: 'sora-history' }

export function App(props: AppProps) {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const [locale, setLocale] = createSignal<Locale>((props.locale as Locale) ?? 'ja')

  // History (autosaved lists) feature. `loadRequest` is an imperative
  // "load this / clear to this" instruction forwarded to WordTable — see
  // WordTableProps.loadRequest for why it carries a monotonic `nonce`
  // rather than being applied from the payload alone. `loadNonce` is a
  // plain module-scoped-per-instance counter (not a signal): nothing ever
  // reads it reactively, it only needs to keep incrementing across calls.
  const [loadRequest, setLoadRequest] = createSignal<{ pairs: Pair[]; nonce: number } | null>(null)
  const [history, setHistory] = createSignal<SavedList[]>([])
  let loadNonce = 0

  const refreshHistory = async () => setHistory(await listSaved())

  onMount(() => {
    void refreshHistory()
  })

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
        <button
          type="button"
          className="history-button"
          aria-label={t().history}
          onClick={() => void refreshHistory()}
          {...historyTrigger}
        >
          {t().history}
        </button>
        <button
          type="button"
          className="new-button"
          onClick={() => {
            void saveList(pairs()).then(() => refreshHistory())
            setLoadRequest({ pairs: [], nonce: ++loadNonce })
          }}
        >
          {t().newList}
        </button>
        <button type="button" className="info-button" aria-label={t().infoLabel} {...popoverTrigger}>
          <span aria-hidden="true">ⓘ</span>
        </button>
      </header>
      <div id="sora-info" role="note" aria-label={t().infoLabel} className="info-popover no-print" {...popoverTarget}>
        <p className="info-lead">
          <strong>Sora</strong>
          {t().infoLead}
        </p>
        <p className="info-note">{t().infoNote}</p>
        <p className="info-privacy">{t().infoPrivacyNote}</p>
        <p className="info-built">
          {locale() === 'ja' ? (
            <span>
              <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
              {' と '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener">Barefoot.js</a>
              {' で構築。'}
            </span>
          ) : (
            <span>
              {'Built with '}
              <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
              {' and '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener">Barefoot.js</a>
              {'.'}
            </span>
          )}
        </p>
        <hr />
        <p className="info-contact">
          {t().infoContactIntro}
          <span className="info-contact-links">
            <a href="https://x.com/kfly8" target="_blank" rel="noopener">x.com/kfly8</a>
            <a href="mailto:kentafly88@gmail.com">kentafly88@gmail.com</a>
          </span>
        </p>
      </div>
      <div
        id="sora-history"
        role="dialog"
        aria-label={t().history}
        className="history-popover no-print"
        {...historyPopoverTarget}
      >
        {history().length === 0 ? (
          <p className="history-empty">{t().historyEmpty}</p>
        ) : (
          history().map((item) => (
            <div className="history-item" key={item.id}>
              <span className="history-item-title">{historyItemTitle(locale(), item.pairs, item.createdAt)}</span>
              <div className="history-item-actions">
                <button
                  type="button"
                  onClick={() => {
                    setLoadRequest({ pairs: item.pairs, nonce: ++loadNonce })
                    document.getElementById('sora-history')?.hidePopover?.()
                  }}
                >
                  {t().loadList}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteList(item.id)
                    await refreshHistory()
                  }}
                >
                  {t().deleteList}
                </button>
              </div>
            </div>
          ))
        )}
        {history().length === 0 ? null : (
          <button
            type="button"
            className="history-clear-all"
            onClick={async () => {
              await clearAllLists()
              await refreshHistory()
            }}
          >
            {t().clearAllLists}
          </button>
        )}
      </div>
      <div className="app-input no-print">
        <WordTable breakIndices={breakIndices()} onChange={setPairs} locale={locale()} loadRequest={loadRequest()} />
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
          onClick={() => {
            void saveList(pairs()).then(() => refreshHistory())
            window.print()
          }}
        >
          {t().print}
        </button>
        <details className="howto no-print">
          <summary>{t().howTo}</summary>
          <video src="/howto.webm" controls muted loop />
        </details>
      </div>
      <PrintSheets layout={layout()} settings={DEFAULTS} />
    </div>
  )
}
