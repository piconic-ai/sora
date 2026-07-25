'use client'

import { createMemo, createSignal } from '@barefootjs/client'
import { messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import { serializePairs } from '../src/lib/parse'
import { WordTable } from './WordTable'
import type { Pair } from '../src/lib/types'

interface EditorMainProps {
  breakIndices: number[]
  onChange: (pairs: Pair[]) => void
  locale: string
  loadRequest?: { pairs: Pair[]; nonce: number } | null
  pairs: Pair[]
  printDisabled: boolean
}

export function EditorMain(props: EditorMainProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])

  // Transient "コピーしました" feedback on the copy button; the timer just
  // reverts the label, so a re-click mid-window restarts it.
  const [copied, setCopied] = createSignal(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  const copyListAsText = async () => {
    await navigator.clipboard.writeText(serializePairs(props.pairs))
    setCopied(true)
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => setCopied(false), 2000)
  }

  return (
    // "editor-main" kept as a bare hook class (no styling of its own) — see
    // App.tsx's focusEditorInput(), which selects '.editor-main .word-table
    // input' to focus the first cell after creating/switching lists.
    <section className="editor-main flex-1 min-w-0">
      {/* Keeps the editing column narrow and centered within its parent
          rather than stretching the input table across the full width. */}
      <div className="flex flex-col gap-4 w-full max-w-[640px] mx-auto">
        <WordTable
          breakIndices={props.breakIndices}
          onChange={props.onChange}
          locale={props.locale}
          loadRequest={props.loadRequest}
        />
        {props.pairs.length === 0 ? (
          <p className="no-print text-[13px] text-[#888] m-0">{t().hint}</p>
        ) : null}
        {props.pairs.length === 0 ? (
          <p className="no-print text-[13px] text-[#888] m-0">{t().pasteHint}</p>
        ) : null}
        {/* Print action + the one browser setting that ruins the sheet
            (header/footer). No on-screen preview: the browser's own print
            preview shows the sheet at full size when you print. */}
        <div className="no-print flex flex-col items-center gap-2 mt-3">
          <button
            type="button"
            className="py-2.5 px-9 text-sm font-semibold tracking-[0.02em] text-white bg-ink border-0 rounded-lg cursor-pointer transition-[background-color,box-shadow] duration-150 enabled:hover:bg-black enabled:hover:shadow-[0_2px_10px_rgba(0,0,0,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:bg-[#d6d6d6] disabled:cursor-not-allowed"
            disabled={props.printDisabled}
            onClick={() => window.print()}
          >
            {t().print}
          </button>
          {/* Wide enough for the tip to sit on one line in either locale;
              text-balance keeps the split even when a narrow viewport wraps it. */}
          <p className="max-w-[32em] text-balance text-center text-[12px] leading-[1.45] text-ink-2 m-0">{t().printTip}</p>
          {/* Quiet secondary action: copies the list as TSV — the no-server
              way to move a list to another device (send it to yourself,
              paste it into the table there). Same disabled condition as
              print: an empty list has nothing to copy. */}
          <button
            type="button"
            className="mt-1 p-0 bg-transparent border-0 cursor-pointer font-[inherit] text-[12px] text-ink-3 underline decoration-hairline underline-offset-2 transition-colors duration-150 hover:text-ink disabled:cursor-not-allowed disabled:no-underline disabled:text-[#c9c9c9]"
            disabled={props.printDisabled}
            onClick={() => void copyListAsText()}
          >
            {copied() ? t().copiedFeedback : t().copyList}
          </button>
        </div>
      </div>
    </section>
  )
}
