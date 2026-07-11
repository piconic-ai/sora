// Pure keyboard-navigation logic for WordTable's front/back cell grid.
//
// This module only *decides* what should happen for a given keystroke —
// it knows nothing about the DOM or about React/BarefootJS. WordTable.tsx
// derives the KeyActionInput from the real DOM (current row position,
// caret position, cell contents) and then executes the returned Action
// (focus movement, row deletion) itself.
//
// Keeping this decision table dependency-free makes it exhaustively
// testable (see tests/tableNav.test.ts) without needing a DOM or a
// mounted component.

/** Column within a row: 0 = front (表面), 1 = back (裏面). */
export type Col = 0 | 1

export type Action =
  | 'none'
  | 'moveUp'
  | 'moveDown'
  | 'moveNextCell'
  | 'movePrevCell'
  | 'deleteRowFocusPrev'
  | 'deleteRowFocusNext'
  | 'moveToFrontCell'

export interface KeyActionInput {
  /** KeyboardEvent.key value, e.g. 'ArrowUp', 'Enter', 'Backspace'. */
  key: string
  /** Which column the event originated from. */
  col: Col
  /** Caret is at position 0 and nothing is selected. */
  caretAtStart: boolean
  /** Caret is at the end of the value and nothing is selected. */
  caretAtEnd: boolean
  /** The focused cell's own value is empty (after trimming). */
  cellEmpty: boolean
  /** Both cells of the row are empty (after trimming). */
  rowEmpty: boolean
  /** This row is the first row in the table. */
  isFirstRow: boolean
  /** This row is the last row in the table. */
  isLastRow: boolean
  /** Modifier keys held down when the event fired (KeyboardEvent flags). */
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

/**
 * Decide what a keystroke inside a WordTable cell should do, based only on
 * the key pressed and the caret/cell/row state — no DOM, no row identity.
 *
 * Callers are expected to preventDefault() whenever the returned action is
 * not 'none' (default browser behavior would otherwise conflict with the
 * cell-to-cell focus move), plus unconditionally for 'Enter' regardless of
 * the resolved action (Enter must never insert a newline or submit).
 */
export function resolveKeyAction(input: KeyActionInput): Action {
  const {
    key,
    col,
    caretAtStart,
    caretAtEnd,
    cellEmpty,
    rowEmpty,
    isFirstRow,
    isLastRow,
    metaKey = false,
    ctrlKey = false,
    altKey = false,
    shiftKey = false,
  } = input

  // Never hijack OS/browser shortcuts. Cmd/Ctrl/Alt combinations (e.g.
  // Cmd+ArrowUp to jump to the start of the field, Cmd+ArrowLeft to jump to
  // line start) and Shift+Arrow (selection extension) must fall through to
  // default behavior rather than being reinterpreted as cell-to-cell
  // navigation.
  if (metaKey || ctrlKey || altKey) return 'none'
  if (shiftKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
    return 'none'
  }

  switch (key) {
    case 'ArrowUp':
      return isFirstRow ? 'none' : 'moveUp'

    case 'ArrowDown':
      return isLastRow ? 'none' : 'moveDown'

    case 'ArrowRight':
      if (!caretAtEnd) return 'none'
      if (col === 1 && isLastRow) return 'none'
      return 'moveNextCell'

    case 'ArrowLeft':
      if (!caretAtStart) return 'none'
      if (col === 0 && isFirstRow) return 'none'
      return 'movePrevCell'

    case 'Enter':
      // Enter ignores caret position — it always tries to move forward.
      if (col === 1 && isLastRow) return 'none'
      return 'moveNextCell'

    case 'Backspace':
      if (!(caretAtStart && cellEmpty)) return 'none'
      if (col === 1) return 'moveToFrontCell'
      // col === 0 (front cell)
      if (!rowEmpty) return 'none'
      // isFirstRow: no previous row to merge into. isLastRow: this is the
      // trailing ghost row — it must always exist (see
      // WordTable.ensureTrailingBlank), so never let it be deleted here.
      // Deleting an empty *middle* row (isFirstRow: false, isLastRow: false)
      // is still allowed below.
      if (isFirstRow || isLastRow) return 'none'
      return 'deleteRowFocusPrev'

    case 'Delete':
      if (!(cellEmpty && col === 0 && rowEmpty)) return 'none'
      // isLastRow covers both "the only row" (isFirstRow && isLastRow) and
      // the trailing ghost row on a multi-row table — neither may be
      // deleted. An empty middle row (isLastRow: false) is still allowed.
      if (isLastRow) return 'none'
      return 'deleteRowFocusNext'

    default:
      return 'none'
  }
}
