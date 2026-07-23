'use client'

import { createMemo } from '@barefootjs/client'
import { messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { WordTable } from './WordTable'
import type { Pair } from '../src/lib/types'

interface EditorMainProps {
  breakIndices: number[]
  onChange: (pairs: Pair[]) => void
  locale: string
  loadRequest?: { pairs: Pair[]; nonce: number } | null
  pairsCount: number
}

export function EditorMain(props: EditorMainProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])

  return (
    // "editor-main" kept as a bare hook class (no styling of its own) — see
    // App.tsx's focusEditorInput(), which selects '.editor-main .word-table
    // input' to focus the first cell after creating/switching lists.
    <section className="editor-main flex-1 min-w-0">
      {/* Keeps the actual editing column narrow and centered within the now
          much wider parent, rather than stretching the input table across
          the full panel. */}
      <div className="flex flex-col gap-4 w-full max-w-[560px] mx-auto">
        <WordTable
          breakIndices={props.breakIndices}
          onChange={props.onChange}
          locale={props.locale}
          loadRequest={props.loadRequest}
        />
        {props.pairsCount === 0 ? (
          <p className="no-print text-[13px] text-[#888] m-0">{t().hint}</p>
        ) : null}
      </div>
    </section>
  )
}
