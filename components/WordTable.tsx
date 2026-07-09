'use client'

import { createSignal } from '@barefootjs/client'
import { parseInput } from '../src/lib/parse'
import type { Pair } from '../src/lib/types'

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
}

let nextRowId = 1

function emptyRow(): Row {
  return { id: nextRowId++, front: '', back: '' }
}

export function WordTable(props: WordTableProps) {
  const [rows, setRows] = createSignal<Row[]>([emptyRow(), emptyRow(), emptyRow()])
  const [pasteError, setPasteError] = createSignal<string | null>(null)

  const emit = (rs: Row[]) => {
    const pairs = rs
      .filter((r) => r.front.trim() !== '' || r.back.trim() !== '')
      .map((r) => ({ front: r.front, back: r.back }))
    props.onChange(pairs)
  }

  const editCell = (id: number, field: 'front' | 'back', value: string) => {
    setRows((rs) => {
      const next = rs.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      emit(next)
      return next
    })
  }

  const addRow = () => {
    setRows((rs) => {
      const next = [...rs, emptyRow()]
      emit(next)
      return next
    })
  }

  const deleteRow = (id: number) => {
    setRows((rs) => {
      const next = rs.length > 1 ? rs.filter((r) => r.id !== id) : rs
      emit(next)
      return next
    })
  }

  const handlePaste = (rowId: number, e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!/[\t\n,]/.test(text)) return // single value — let the browser paste normally
    e.preventDefault()
    const { pairs, error } = parseInput(text)
    setPasteError(error)
    if (pairs.length === 0) return
    setRows((rs) => {
      const rowIndex = rs.findIndex((r) => r.id === rowId)
      const start = rowIndex === -1 ? rs.length : rowIndex
      const before = rs.slice(0, start)
      const pasted = pairs.map((p) => ({ id: nextRowId++, front: p.front, back: p.back }))
      const after = rs.slice(start + pairs.length)
      const next = [...before, ...pasted, ...(after.length > 0 ? after : [emptyRow()])]
      emit(next)
      return next
    })
  }

  return (
    <div className="word-table-wrap">
      {pasteError() && <p className="input-error">{pasteError()}</p>}
      <table className="word-table">
        <thead>
          <tr>
            <th>表面</th>
            <th>裏面</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows().map((row, i) => (
            <tr key={row.id} className={props.breakIndices.includes(i) ? 'wt-row wt-page-break' : 'wt-row'}>
              <td>
                <input
                  type="text"
                  value={row.front}
                  onInput={(e) => editCell(row.id, 'front', (e.target as HTMLInputElement).value)}
                  onPaste={(e) => handlePaste(row.id, e as ClipboardEvent)}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={row.back}
                  onInput={(e) => editCell(row.id, 'back', (e.target as HTMLInputElement).value)}
                />
              </td>
              <td>
                <button type="button" className="wt-delete" onClick={() => deleteRow(row.id)} aria-label="行を削除">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colspan={3}>
              <button type="button" className="wt-add" onClick={addRow}>
                + 行を追加
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
