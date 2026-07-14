import { describe, expect, test } from 'vitest'
import { resolveKeyAction } from '../src/lib/tableNav'
import type { KeyActionInput } from '../src/lib/tableNav'

// A "middle" row: not first, not last, with content in both cells and the
// caret sitting mid-value (neither at start nor end). Tests override only
// the fields relevant to the case under test.
function baseInput(overrides: Partial<KeyActionInput> = {}): KeyActionInput {
  return {
    key: 'ArrowUp',
    col: 0,
    caretAtStart: false,
    caretAtEnd: false,
    cellEmpty: false,
    rowEmpty: false,
    isFirstRow: false,
    isLastRow: false,
    ...overrides,
  }
}

describe('resolveKeyAction: ArrowUp', () => {
  test('moves up from a middle row, front column', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowUp', col: 0, isFirstRow: false }))).toBe('moveUp')
  })

  test('moves up from a middle row, back column', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowUp', col: 1, isFirstRow: false }))).toBe('moveUp')
  })

  test('does nothing on the first row', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowUp', isFirstRow: true }))).toBe('none')
  })

  test('does nothing on the first row even if it is also the last row', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowUp', isFirstRow: true, isLastRow: true }))).toBe('none')
  })

  test('caret position is irrelevant — moves up regardless of caretAtStart/caretAtEnd', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'ArrowUp', isFirstRow: false, caretAtStart: false, caretAtEnd: false }),
      ),
    ).toBe('moveUp')
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowUp', isFirstRow: false, caretAtStart: true, caretAtEnd: true })),
    ).toBe('moveUp')
  })
})

describe('resolveKeyAction: ArrowDown', () => {
  test('moves down from a middle row, front column', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowDown', col: 0, isLastRow: false }))).toBe('moveDown')
  })

  test('moves down from a middle row, back column', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowDown', col: 1, isLastRow: false }))).toBe('moveDown')
  })

  test('does nothing on the last row', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowDown', isLastRow: true }))).toBe('none')
  })

  test('caret position is irrelevant — moves down regardless of caretAtStart/caretAtEnd', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowDown', isLastRow: false, caretAtStart: false, caretAtEnd: false })),
    ).toBe('moveDown')
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowDown', isLastRow: false, caretAtStart: true, caretAtEnd: true })),
    ).toBe('moveDown')
  })
})

describe('resolveKeyAction: ArrowRight', () => {
  test('does nothing when caret is not at the end (front column)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowRight', col: 0, caretAtEnd: false }))).toBe('none')
  })

  test('does nothing when caret is not at the end (back column)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowRight', col: 1, caretAtEnd: false }))).toBe('none')
  })

  test('moves front -> back on the same row when caret is at the end', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowRight', col: 0, caretAtEnd: true }))).toBe('moveNextCell')
  })

  test('front -> back works even on the last row (back cell always exists)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowRight', col: 0, caretAtEnd: true, isLastRow: true }))).toBe(
      'moveNextCell',
    )
  })

  test('moves back -> next row front when caret is at the end and a next row exists', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowRight', col: 1, caretAtEnd: true, isLastRow: false }))).toBe(
      'moveNextCell',
    )
  })

  test('does nothing from the back cell of the last row', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowRight', col: 1, caretAtEnd: true, isLastRow: true }))).toBe('none')
  })
})

describe('resolveKeyAction: ArrowLeft', () => {
  test('does nothing when caret is not at the start (front column)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 0, caretAtStart: false }))).toBe('none')
  })

  test('does nothing when caret is not at the start (back column)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 1, caretAtStart: false }))).toBe('none')
  })

  test('moves back -> front on the same row when caret is at the start', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 1, caretAtStart: true }))).toBe('movePrevCell')
  })

  test('back -> front works even on the first row (front cell always exists)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 1, caretAtStart: true, isFirstRow: true }))).toBe(
      'movePrevCell',
    )
  })

  test('moves front -> previous row back when caret is at the start and a previous row exists', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 0, caretAtStart: true, isFirstRow: false }))).toBe(
      'movePrevCell',
    )
  })

  test('does nothing from the front cell of the first row', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 0, caretAtStart: true, isFirstRow: true }))).toBe(
      'none',
    )
  })
})

describe('resolveKeyAction: Enter', () => {
  test('front -> back on the same row, regardless of caret position', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Enter', col: 0, caretAtStart: false, caretAtEnd: false })),
    ).toBe('moveNextCell')
  })

  test('front -> back even when the front cell is empty', () => {
    expect(resolveKeyAction(baseInput({ key: 'Enter', col: 0, cellEmpty: true, rowEmpty: true }))).toBe(
      'moveNextCell',
    )
  })

  test('front -> back even on the last row (ghost row) — Enter never deletes, only moves', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Enter', col: 0, isLastRow: true, cellEmpty: true, rowEmpty: true })),
    ).toBe('moveNextCell')
  })

  test('back -> next row front when a next row exists', () => {
    expect(resolveKeyAction(baseInput({ key: 'Enter', col: 1, isLastRow: false }))).toBe('moveNextCell')
  })

  test('does nothing on an empty back cell of the last row (no next row to move to)', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Enter', col: 1, isLastRow: true, cellEmpty: true, rowEmpty: true })),
    ).toBe('none')
  })
})

describe('resolveKeyAction: Backspace', () => {
  test('does nothing when caret is not at the start (front column)', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Backspace', col: 0, caretAtStart: false, cellEmpty: true, rowEmpty: true })),
    ).toBe('none')
  })

  test('does nothing when caret is not at the start (back column)', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Backspace', col: 1, caretAtStart: false, cellEmpty: true, rowEmpty: true })),
    ).toBe('none')
  })

  test('does nothing when the cell is not empty (normal character deletion)', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Backspace', col: 0, caretAtStart: true, cellEmpty: false })),
    ).toBe('none')
  })

  test('moves back -> front on the same row when the back cell is empty', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'Backspace', col: 1, caretAtStart: true, cellEmpty: true, rowEmpty: false }),
      ),
    ).toBe('moveToFrontCell')
  })

  test('back -> front even when the whole row is empty', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'Backspace', col: 1, caretAtStart: true, cellEmpty: true, rowEmpty: true })),
    ).toBe('moveToFrontCell')
  })

  // Backspace on an empty front cell whose row is NOT fully empty mirrors
  // Enter's forward move (front -> back -> next-row-front) in reverse: it
  // steps back into the previous row's back cell. Only when the whole row is
  // empty does it delete the row instead (see the deleteRowFocusPrev tests
  // below).
  test('moves to the previous row back cell even when the back cell still has content', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'Backspace', col: 0, caretAtStart: true, cellEmpty: true, rowEmpty: false }),
      ),
    ).toBe('movePrevCell')
  })

  test('does nothing on an empty front cell that is the first row (no previous row to move into)', () => {
    expect(
      resolveKeyAction(
        baseInput({
          key: 'Backspace',
          col: 0,
          caretAtStart: true,
          cellEmpty: true,
          rowEmpty: true,
          isFirstRow: true,
        }),
      ),
    ).toBe('none')
  })

  // On an otherwise-empty middle row (not first, not last), Backspace in the
  // front cell removes the row entirely and steps back into the previous
  // row's back cell — the row is genuinely gone, not just left behind.
  test('deletes an empty middle row (not first, not last) and focuses the previous back cell', () => {
    expect(
      resolveKeyAction(
        baseInput({
          key: 'Backspace',
          col: 0,
          caretAtStart: true,
          cellEmpty: true,
          rowEmpty: true,
          isFirstRow: false,
          isLastRow: false,
        }),
      ),
    ).toBe('deleteRowFocusPrev')
  })

  // The trailing blank "ghost row" (see WordTable's ensureTrailingBlank) must
  // never be deleted — it is the always-present place to type the next pair.
  // Backspace out of it only moves focus to the previous row's back cell.
  test('moves to the previous row back cell from the trailing ghost row (isLastRow) without deleting it', () => {
    expect(
      resolveKeyAction(
        baseInput({
          key: 'Backspace',
          col: 0,
          caretAtStart: true,
          cellEmpty: true,
          rowEmpty: true,
          isFirstRow: false,
          isLastRow: true,
        }),
      ),
    ).toBe('movePrevCell')
  })
})

describe('resolveKeyAction: Delete', () => {
  test('does nothing when the cell is not empty', () => {
    expect(resolveKeyAction(baseInput({ key: 'Delete', col: 0, cellEmpty: false, rowEmpty: false }))).toBe('none')
  })

  test('does nothing from the back column', () => {
    expect(resolveKeyAction(baseInput({ key: 'Delete', col: 1, cellEmpty: true, rowEmpty: true }))).toBe('none')
  })

  test('does nothing on an empty front cell when the back cell still has content', () => {
    expect(resolveKeyAction(baseInput({ key: 'Delete', col: 0, cellEmpty: true, rowEmpty: false }))).toBe('none')
  })

  test('does nothing when it is the only row', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'Delete', col: 0, cellEmpty: true, rowEmpty: true, isFirstRow: true, isLastRow: true }),
      ),
    ).toBe('none')
  })

  test('deletes an empty first row (not the only row) and focuses the row that shifts up', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'Delete', col: 0, cellEmpty: true, rowEmpty: true, isFirstRow: true, isLastRow: false }),
      ),
    ).toBe('deleteRowFocusNext')
  })

  // Regression test for the FB3 review finding: same ghost-row protection
  // as Backspace above — the trailing blank row must never be deletable via
  // Delete either, even when it isn't also the first row.
  test('does NOT delete the trailing ghost row (empty, isLastRow) even when a previous row exists', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'Delete', col: 0, cellEmpty: true, rowEmpty: true, isFirstRow: false, isLastRow: true }),
      ),
    ).toBe('none')
  })

  test('deletes an empty middle row and focuses the row that shifts up', () => {
    expect(
      resolveKeyAction(
        baseInput({ key: 'Delete', col: 0, cellEmpty: true, rowEmpty: true, isFirstRow: false, isLastRow: false }),
      ),
    ).toBe('deleteRowFocusNext')
  })
})

describe('resolveKeyAction: modifier keys defer to OS/browser shortcuts', () => {
  test('Cmd+ArrowUp does nothing (would otherwise move focus, hijacking caret-to-start)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowUp', isFirstRow: false, metaKey: true }))).toBe('none')
  })

  test('Cmd+ArrowDown does nothing', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowDown', isLastRow: false, metaKey: true }))).toBe('none')
  })

  test('Cmd+ArrowLeft does nothing (would otherwise move focus, hijacking line-start)', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 1, caretAtStart: true, metaKey: true })),
    ).toBe('none')
  })

  test('Ctrl+ArrowRight does nothing', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowRight', col: 0, caretAtEnd: true, ctrlKey: true })),
    ).toBe('none')
  })

  test('Alt+ArrowDown does nothing', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowDown', isLastRow: false, altKey: true }))).toBe('none')
  })

  test('Cmd+Backspace does nothing (would otherwise move focus to the previous row)', () => {
    expect(
      resolveKeyAction(
        baseInput({
          key: 'Backspace',
          col: 0,
          caretAtStart: true,
          cellEmpty: true,
          rowEmpty: true,
          isFirstRow: false,
          isLastRow: false,
          metaKey: true,
        }),
      ),
    ).toBe('none')
  })

  test('Cmd+Enter does nothing (Enter would otherwise move to the next cell)', () => {
    expect(resolveKeyAction(baseInput({ key: 'Enter', col: 0, metaKey: true }))).toBe('none')
  })

  test('Shift+ArrowUp does nothing (respects text selection extension)', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowUp', isFirstRow: false, shiftKey: true }))).toBe('none')
  })

  test('Shift+ArrowDown does nothing', () => {
    expect(resolveKeyAction(baseInput({ key: 'ArrowDown', isLastRow: false, shiftKey: true }))).toBe('none')
  })

  test('Shift+ArrowLeft does nothing', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowLeft', col: 1, caretAtStart: true, shiftKey: true })),
    ).toBe('none')
  })

  test('Shift+ArrowRight does nothing', () => {
    expect(
      resolveKeyAction(baseInput({ key: 'ArrowRight', col: 0, caretAtEnd: true, shiftKey: true })),
    ).toBe('none')
  })

  test('Shift alone does not suppress non-arrow keys — Shift+Backspace still moves to the previous row', () => {
    expect(
      resolveKeyAction(
        baseInput({
          key: 'Backspace',
          col: 0,
          caretAtStart: true,
          cellEmpty: true,
          rowEmpty: false,
          isFirstRow: false,
          isLastRow: false,
          shiftKey: true,
        }),
      ),
    ).toBe('movePrevCell')
  })
})

describe('resolveKeyAction: other keys', () => {
  test('plain character keys are left to default behavior', () => {
    expect(resolveKeyAction(baseInput({ key: 'a' }))).toBe('none')
  })

  test('Tab is left to default behavior', () => {
    expect(resolveKeyAction(baseInput({ key: 'Tab' }))).toBe('none')
  })

  test('Shift (modifier-only key) is left to default behavior', () => {
    expect(resolveKeyAction(baseInput({ key: 'Shift' }))).toBe('none')
  })
})
