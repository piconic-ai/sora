'use client'

import { createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'
import { parseInput } from '../src/lib/parse'
import { messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'
import type { Pair } from '../src/lib/types'
import { resolveKeyAction } from '../src/lib/tableNav'
import type { Col } from '../src/lib/tableNav'
import { loadDraft, saveDraft } from '../src/lib/storage/drafts'

interface Row {
  id: number
  front: string
  back: string
}

interface WordTableProps {
  // Pair index (0-based, within the full pair list) after which a page
  // boundary falls. Excludes the very last pair overall — there is no
  // line to draw after the final row. See layout.ts's
  // pageBreakAfterPairIndex.
  breakIndices: number[]
  onChange: (pairs: Pair[]) => void
  locale: string
}

let nextRowId = 1

function emptyRow(): Row {
  return { id: nextRowId++, front: '', back: '' }
}

// Self-healing normalization for the "there is always exactly one blank row
// at the end of the table" invariant. Every code path that produces a new
// `rows` array must run its result through this before setRows/emit, so
// that if the invariant is ever violated — e.g. a future bug, or a
// resolveKeyAction regression that lets the ghost row be deleted — it is
// restored on the very next render instead of leaving the table in a state
// where Enter/typing on the last row can no longer create a new row.
function ensureTrailingBlank(rows: Row[]): Row[] {
  if (rows.length === 0) return [emptyRow()]
  const last = rows[rows.length - 1]
  if (last.front.trim() !== '' || last.back.trim() !== '') {
    return [...rows, emptyRow()]
  }
  return rows
}

// True only for the untouched initial table (the single trailing blank row
// with nothing typed into it yet). Guards draft restore: if the user has
// already started typing before the async loadDraft() resolves, their input
// wins and the restored draft is discarded rather than clobbering it.
function isPristine(rows: Row[]): boolean {
  return rows.length === 1 && rows[0].front === '' && rows[0].back === ''
}

const DRAFT_SAVE_DEBOUNCE_MS = 500

// Focuses the input in `col` (0 = front, 1 = back) inside `tr`, if both
// exist, and moves the caret to the end of its value.
function focusCellIn(tr: Element | null | undefined, col: Col) {
  if (!tr) return
  const input = tr.querySelectorAll('input')[col] as HTMLInputElement | undefined
  if (!input) return
  input.focus()
  const len = input.value.length
  input.setSelectionRange(len, len)
}

export function WordTable(props: WordTableProps) {
  const [rows, setRows] = createSignal<Row[]>([emptyRow()])
  const [pasteError, setPasteError] = createSignal<string | null>(null)

  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])

  // breakIndices (from App) is a pair index — blank rows excluded — but
  // rows() includes blank rows, so each row's position and its pair index
  // can diverge. Map each row to its pair index (-1 if blank) so the page-
  // break line lands on the correct row regardless of blank rows above it.
  const pairIndexByRow = createMemo(() => {
    let pairIndex = -1
    return rows().map((row) => (row.front.trim() !== '' || row.back.trim() !== '' ? ++pairIndex : -1))
  })

  // Draft autosave: debounced so rapid keystrokes coalesce into one write
  // instead of hitting IndexedDB on every keystroke. `latestPairs` +
  // `flushSave` let pagehide/visibilitychange save the most recent value
  // immediately, bypassing the timer, when the page is about to go away.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let latestPairs: Pair[] = []

  const flushSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    void saveDraft(latestPairs)
  }

  const scheduleSave = (pairs: Pair[]) => {
    latestPairs = pairs
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveDraft(pairs)
    }, DRAFT_SAVE_DEBOUNCE_MS)
  }

  const emit = (rs: Row[]) => {
    const pairs = rs
      .filter((r) => r.front.trim() !== '' || r.back.trim() !== '')
      .map((r) => ({ front: r.front, back: r.back }))
    props.onChange(pairs)
    scheduleSave(pairs)
  }

  // Draft restore (PR1) + save-on-exit listeners. Runs once on mount, client
  // side only — see isPristine above for why a restore loses to the user's
  // own input, and drafts.ts/db.ts for why a missing/broken IndexedDB just
  // resolves to "no draft" instead of throwing.
  onMount(() => {
    const flushOnHide = () => flushSave()
    const flushOnVisibilityChange = () => {
      if (document.hidden) flushSave()
    }
    window.addEventListener('pagehide', flushOnHide)
    document.addEventListener('visibilitychange', flushOnVisibilityChange)

    onCleanup(() => {
      window.removeEventListener('pagehide', flushOnHide)
      document.removeEventListener('visibilitychange', flushOnVisibilityChange)
      if (saveTimer !== null) clearTimeout(saveTimer)
    })

    void (async () => {
      const pairs = await loadDraft()
      if (!pairs || pairs.length === 0) return
      if (!isPristine(rows())) return
      const restored = ensureTrailingBlank(pairs.map((p) => ({ id: nextRowId++, front: p.front, back: p.back })))
      setRows(restored)
      emit(restored)
    })()
  })

  // Invariant: there is always exactly one empty row at the end of the
  // table, so there is always somewhere to type the next pair — this is
  // what replaces the old "+ Add row" button. Enforced by
  // ensureTrailingBlank() in every code path below that produces a new
  // `rows` array (edit, paste, row deletion).
  const editCell = (id: number, field: 'front' | 'back', value: string) => {
    setRows((rs) => {
      const edited = rs.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      const next = ensureTrailingBlank(edited)
      emit(next)
      return next
    })
  }

  const deleteRowById = (id: number) => {
    setRows((rs) => {
      const filtered = rs.filter((r) => r.id !== id)
      const next = ensureTrailingBlank(filtered)
      emit(next)
      return next
    })
  }

  const handlePaste = (rowId: number, e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!/[\t\n,]/.test(text)) return // single value — let the browser paste normally
    e.preventDefault()
    const { pairs, error } = parseInput(text)
    setPasteError(error ? t().pasteError : null)
    if (pairs.length === 0) return
    setRows((rs) => {
      const rowIndex = rs.findIndex((r) => r.id === rowId)
      const start = rowIndex === -1 ? rs.length : rowIndex
      const before = rs.slice(0, start)
      const pasted = pairs.map((p) => ({ id: nextRowId++, front: p.front, back: p.back }))
      const after = rs.slice(start + pairs.length)
      const merged = [...before, ...pasted, ...(after.length > 0 ? after : [emptyRow()])]
      const next = ensureTrailingBlank(merged)
      emit(next)
      return next
    })
  }

  // Keyboard navigation across the front/back grid (see src/lib/tableNav.ts
  // for the decision table). Deliberately keyed off `rowId` + live DOM
  // lookups rather than the row's render-time index or a captured `tr`
  // reference — piconic-ai/barefootjs#2218 showed that index/closure-based
  // wiring into a keyed loop can resolve against stale positions once rows
  // are added or removed, so every target cell here is re-found in the DOM
  // at event time.
  const handleKeyDown = (rowId: number, e: KeyboardEvent) => {
    // Never intercept keys while an IME composition is in progress.
    // `keyCode === 229` is the legacy sentinel some browsers still emit for
    // the composition-confirming keystroke even when `isComposing` is false;
    // read it via a cast to sidestep the `keyCode` deprecation lint.
    // Note: this guard is tuned for desktop IMEs (it protects the Enter that
    // confirms a Japanese conversion). Some Android software keyboards also
    // report keyCode 229 for ordinary, non-conversion keys such as
    // Backspace, which would suppress row-deletion there too. Mobile is a
    // secondary target for this PC-first editor, so we accept that gap for
    // now rather than complicate this guard — revisit if mobile usage grows.
    if (e.isComposing || (e as { keyCode?: number }).keyCode === 229) return

    const input = e.target as HTMLInputElement
    const tr = input.closest('tr')
    if (!tr) return
    const tbody = tr.closest('tbody')
    if (!tbody) return

    const trs = Array.from(tbody.querySelectorAll('tr'))
    const rowIndex = trs.indexOf(tr)
    if (rowIndex === -1) return

    const inputs = Array.from(tr.querySelectorAll('input'))
    const col = inputs.indexOf(input) as Col
    const otherInput = inputs[col === 0 ? 1 : 0]

    const noSelection = input.selectionStart === input.selectionEnd
    const caretAtStart = noSelection && input.selectionStart === 0
    const caretAtEnd = noSelection && input.selectionStart === input.value.length
    const cellEmpty = input.value.trim() === ''
    const rowEmpty = cellEmpty && (otherInput?.value.trim() ?? '') === ''
    const isFirstRow = rowIndex === 0
    const isLastRow = rowIndex === trs.length - 1

    const action = resolveKeyAction({
      key: e.key,
      col,
      caretAtStart,
      caretAtEnd,
      cellEmpty,
      rowEmpty,
      isFirstRow,
      isLastRow,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
    })

    // Enter must never insert a newline / submit a form, regardless of
    // whether a target cell exists. Every other key only prevents the
    // default when it is actually moving focus or deleting a row.
    if (e.key === 'Enter') {
      e.preventDefault()
    } else if (action !== 'none') {
      e.preventDefault()
    } else {
      return
    }

    switch (action) {
      case 'moveUp':
        focusCellIn(trs[rowIndex - 1], col)
        break
      case 'moveDown':
        focusCellIn(trs[rowIndex + 1], col)
        break
      case 'moveNextCell':
        if (col === 0) focusCellIn(tr, 1)
        else focusCellIn(trs[rowIndex + 1], 0)
        break
      case 'movePrevCell':
        if (col === 1) focusCellIn(tr, 0)
        else focusCellIn(trs[rowIndex - 1], 1)
        break
      case 'moveToFrontCell':
        focusCellIn(tr, 0)
        break
      case 'deleteRowFocusPrev': {
        const targetTr = trs[rowIndex - 1]
        const targetKey = targetTr?.getAttribute('data-key') ?? null
        deleteRowById(rowId)
        if (targetKey !== null) {
          requestAnimationFrame(() => {
            focusCellIn(tbody.querySelector(`tr[data-key="${targetKey}"]`), 0)
          })
        }
        break
      }
      case 'deleteRowFocusNext': {
        const targetTr = trs[rowIndex + 1] ?? trs[rowIndex - 1]
        const targetKey = targetTr?.getAttribute('data-key') ?? null
        deleteRowById(rowId)
        if (targetKey !== null) {
          requestAnimationFrame(() => {
            focusCellIn(tbody.querySelector(`tr[data-key="${targetKey}"]`), 0)
          })
        }
        break
      }
      case 'none':
        break
    }
  }

  return (
    <div className="word-table-wrap">
      {pasteError() && <p className="input-error">{pasteError()}</p>}
      <table className="word-table">
        <thead>
          <tr>
            <th>{t().front}</th>
            <th>{t().back}</th>
          </tr>
        </thead>
        <tbody>
          {rows().map((row, i) => (
            <tr
              key={row.id}
              className={props.breakIndices.includes(pairIndexByRow()[i]) ? 'wt-row wt-page-break' : 'wt-row'}
            >
              <td>
                <input
                  type="text"
                  value={row.front}
                  onInput={(e) => editCell(row.id, 'front', (e.target as HTMLInputElement).value)}
                  onPaste={(e) => handlePaste(row.id, e as ClipboardEvent)}
                  onKeyDown={(e) => handleKeyDown(row.id, e as KeyboardEvent)}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={row.back}
                  onInput={(e) => editCell(row.id, 'back', (e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => handleKeyDown(row.id, e as KeyboardEvent)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
