'use client'

import { createMemo } from '@barefootjs/client'
import { messages, pageMeterCaption } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { WordTable } from './WordTable'
import type { Pair } from '../src/lib/types'
import type { PageFill } from '../src/lib/pageMeter'

interface EditorMainProps {
  breakIndices: number[]
  onChange: (pairs: Pair[]) => void
  locale: string
  loadRequest?: { pairs: Pair[]; nonce: number } | null
  pairsCount: number
  pageFill: PageFill
  printDisabled: boolean
}

export function EditorMain(props: EditorMainProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])
  // Computed outside JSX: an inline `as Locale` cast on a JSX-embedded call
  // argument doesn't survive the compiler's SSR-mirror re-serialization
  // (drops back to the untyped `string` prop, failing tsc on the generated
  // public/components/*.tsx — same class of gap as the null-typed-let and
  // updater-fn quirks in the framework notes).
  const pageCaption = createMemo(() => pageMeterCaption((props.locale as Locale) ?? 'ja', props.pageFill))

  return (
    <section className="editor-main">
      <div className="editor-body">
        <WordTable
          breakIndices={props.breakIndices}
          onChange={props.onChange}
          locale={props.locale}
          loadRequest={props.loadRequest}
        />
        {props.pairsCount === 0 ? (
          <p className="hint no-print">{t().hint}</p>
        ) : (
          <div className="page-meter no-print">
            <div className="page-meter-track">
              <div
                className={props.pageFill.isFull ? 'page-meter-fill is-full' : 'page-meter-fill'}
                style={`width:${Math.round(props.pageFill.ratio * 100)}%`}
              />
            </div>
            <p className="page-meter-caption">{pageCaption()}</p>
          </div>
        )}
        <button type="button" className="print-button no-print" disabled={props.printDisabled} onClick={() => window.print()}>
          {t().print}
        </button>
      </div>
    </section>
  )
}
