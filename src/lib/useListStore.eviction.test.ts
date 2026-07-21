// createNewList's MAX_LISTS eviction (confirm-before-evicting-the-oldest,
// and the cancel path's re-anchoring). See useListStore.testHelpers.ts for
// the shared setup/cleanup.
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { useListStore } from './useListStore'
import { MAX_LISTS, getList } from './storage/lists'
import type { SavedList } from './storage/schema'
import { cleanupListStoreTest, confirmMock, flushIndexedDb, setup, stubBrowserGlobals } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

function seedFullList(store: ReturnType<typeof useListStore>): SavedList[] {
  const now = Date.now()
  const seeded: SavedList[] = Array.from({ length: MAX_LISTS }, (_, i) => ({
    v: 1,
    id: `seed-${i}`,
    pairs: [{ front: `w${i}`, back: `m${i}` }],
    createdAt: now + i,
    updatedAt: now + i,
  }))
  store.setLists(seeded)
  return seeded
}

describe('createNewList: MAX_LISTS eviction', () => {
  test('at the cap, confirms and evicts the oldest before adding the new card — net count unchanged', async () => {
    const { store, setPairs } = setup()
    const seeded = seedFullList(store)
    // Keep the active (index 0) card's live pairs() matching its stored
    // content, so commitActiveEdits treats it as "persist as-is" rather
    // than evaporating it — otherwise the pre-eviction count would already
    // be MAX_LISTS - 1, missing the eviction boundary this test targets.
    setPairs(seeded[0].pairs)

    store.createNewList()

    expect(confirmMock).toHaveBeenCalled()
    const ls = store.lists()
    expect(ls.length).toBe(MAX_LISTS)
    expect(ls.some((l) => l.id === 'seed-0')).toBe(false)
    expect(store.activeList()!.pairs).toEqual([]) // now on the fresh new card
    await flushIndexedDb()
    expect(await getList('seed-0')).toBeNull()
  })

  test('never exceeds MAX_LISTS even across repeated creates at the cap', async () => {
    const { store, setPairs } = setup()
    seedFullList(store)
    setPairs([]) // active card starts empty and evaporates each round — isolates the eviction-count invariant from the persist-matching setup above

    store.createNewList()
    store.createNewList()
    store.createNewList()

    expect(store.lists().length).toBeLessThanOrEqual(MAX_LISTS)
  })

  test('cancelling eviction re-anchors activeIndex onto a valid card instead of leaving it dangling', async () => {
    const { store, setPairs } = setup()
    const seeded = seedFullList(store)
    setPairs(seeded[0].pairs)
    confirmMock.mockReturnValue(false)

    store.createNewList()

    expect(store.lists().length).toBe(MAX_LISTS) // nothing evicted, nothing added
    expect(store.activeList()).not.toBeNull()
    expect(store.activeList()!.id).toBe('seed-0')
  })
})
