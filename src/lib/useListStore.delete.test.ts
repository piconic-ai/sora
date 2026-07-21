// deleteCurrentList's next/previous/fresh fallback for where the editor
// lands after a delete. See useListStore.testHelpers.ts for the shared
// setup/cleanup.
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanupListStoreTest, confirmMock, moveActiveTo, setup, stubBrowserGlobals, threeSeededLists } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

describe('deleteCurrentList: where the editor lands afterward', () => {
  test('deleting the only list recreates a fresh empty one', () => {
    const { store } = setup()
    store.createNewList()
    const card = store.activeList()!
    // deleteCurrentList reads pairs from `lists()`, not the live pairs()
    // signal (it doesn't call commitActiveEdits) — non-empty here to
    // exercise the confirm-gate below.
    store.setLists([{ ...card, pairs: [{ front: 'x', back: 'y' }] }])

    store.deleteCurrentList()

    expect(store.lists().length).toBe(1)
    expect(store.activeList()!.pairs).toEqual([])
    expect(confirmMock).toHaveBeenCalled()
  })

  test('deleting a middle card lands on the "next" (newer) card that slides into its place', () => {
    const { store, setPairs } = setup()
    const [a, b, c] = threeSeededLists()
    store.setLists([a, b, c])
    moveActiveTo(store, setPairs, b.id)

    store.deleteCurrentList()

    expect(store.lists().map((l) => l.id)).toEqual(['a', 'c'])
    expect(store.activeList()!.id).toBe('c')
  })

  test('deleting the last (newest) card falls back to the previous (older) one', () => {
    const { store, setPairs } = setup()
    const [a, b, c] = threeSeededLists()
    store.setLists([a, b, c])
    moveActiveTo(store, setPairs, c.id)

    store.deleteCurrentList()

    expect(store.lists().map((l) => l.id)).toEqual(['a', 'b'])
    expect(store.activeList()!.id).toBe('b')
  })

  test('deleting an untouched empty card asks no confirmation', () => {
    const { store, setPairs } = setup()
    store.createNewList()
    setPairs([]) // still empty — never touched

    store.deleteCurrentList()

    expect(confirmMock).not.toHaveBeenCalled()
  })

  test('declining the confirmation leaves the list untouched', () => {
    const { store, setPairs } = setup()
    const [a, b, c] = threeSeededLists()
    store.setLists([a, b, c])
    moveActiveTo(store, setPairs, b.id)
    confirmMock.mockReturnValue(false)

    store.deleteCurrentList()

    expect(store.lists().map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(store.activeList()!.id).toBe('b')
  })
})
