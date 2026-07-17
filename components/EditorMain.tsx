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

// The one place brand green appears in the editor: a full page (printable)
// is rewarded with it; otherwise a quiet dark fill.
const pageMeterFillBase = 'h-full rounded-[2px] transition-[width,background-color] duration-300 ease-in-out'
const pageMeterFillFull = `${pageMeterFillBase} bg-brand`
const pageMeterFillPartial = `${pageMeterFillBase} bg-[#383838]`

export function EditorMain(props: EditorMainProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])
  // Computed outside JSX: an inline `as Locale` cast on a JSX-embedded call
  // argument doesn't survive the compiler's SSR-mirror re-serialization
  // (drops back to the untyped `string` prop, failing tsc on the generated
  // public/components/*.tsx — same class of gap as the null-typed-let and
  // updater-fn quirks in the framework notes).
  const pageCaption = createMemo(() => pageMeterCaption((props.locale as Locale) ?? 'ja', props.pageFill))

  return (
    // "editor-main" kept as a bare hook class (no styling of its own) — see
    // App.tsx's focusEditorInput(), which selects '.editor-main .word-table
    // input' to focus the first cell after creating/switching lists.
    <section className="editor-main flex-1 min-w-0">
      {/* Keeps the actual editing column (table/meter/print button) narrow
          and centered within the now much wider parent, rather than
          stretching the input table across the full right panel. */}
      <div className="flex flex-col gap-4 w-full max-w-[760px] mx-auto">
        <WordTable
          breakIndices={props.breakIndices}
          onChange={props.onChange}
          locale={props.locale}
          loadRequest={props.loadRequest}
        />
        {props.pairsCount === 0 ? (
          <p className="no-print text-[13px] text-[#888] m-0">{t().hint}</p>
        ) : (
          <div className="no-print flex flex-col gap-1.5 mt-1">
            <div className="h-1 bg-hairline-soft rounded-[2px] overflow-hidden">
              <div
                className={props.pageFill.isFull ? pageMeterFillFull : pageMeterFillPartial}
                style={`width:${Math.round(props.pageFill.ratio * 100)}%`}
              />
            </div>
            <p className="text-[12.5px] text-ink-3 tracking-[0.01em] m-0">{pageCaption()}</p>
          </div>
        )}
        <button
          type="button"
          className="no-print self-center mt-3 py-2.5 px-9 text-sm font-semibold tracking-[0.02em] text-white bg-ink border-0 rounded-lg cursor-pointer transition-[background-color,box-shadow] duration-150 enabled:hover:bg-black enabled:hover:shadow-[0_2px_10px_rgba(0,0,0,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:bg-[#d6d6d6] disabled:cursor-not-allowed"
          disabled={props.printDisabled}
          onClick={() => window.print()}
        >
          {t().print}
        </button>
      </div>
    </section>
  )
}
