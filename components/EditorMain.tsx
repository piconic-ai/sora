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
            <p className="page-meter-caption">{pageMeterCaption(props.locale as Locale, props.pageFill)}</p>
          </div>
        )}
        <button type="button" className="print-button no-print" disabled={props.printDisabled} onClick={() => window.print()}>
          {t().print}
        </button>
      </div>
    </section>
  )
}
