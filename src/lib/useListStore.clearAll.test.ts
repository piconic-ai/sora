// handleClearAllLists: wipe-everything-and-reseed-the-sample, and the
// decline-the-confirmation no-op. See useListStore.testHelpers.ts for the
// shared setup/cleanup.
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createList, getList } from './storage/lists'
import { cleanupListStoreTest, confirmMock, setup, stubBrowserGlobals, threeSeededLists } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

describe('handleClearAllLists', () => {
  test('wipes every list, tombstones them, and reseeds a single sample list', async () => {
    const { store } = setup()
    // Persisted directly through the storage layer (not the store's own
    // navigate/commitActiveEdits dance) — handleClearAllLists wipes the
    // 'lists' object store unconditionally, so what matters here is that
    // real persisted records existed beforehand, not how they got there.
    const [a, b, c] = threeSeededLists()
    for (const l of [a, b, c]) await createList(l.pairs, { id: l.id, createdAt: l.createdAt, title: l.title })
    store.setLists([a, b, c])

    await store.handleClearAllLists()

    expect(confirmMock).toHaveBeenCalled()
    expect(store.lists().length).toBe(1)
    expect(store.activeList()!.pairs.length).toBeGreaterThan(0) // the reseeded sample
    for (const id of ['a', 'b', 'c']) {
      expect(await getList(id)).toBeNull()
    }
  })

  test('declining the confirmation leaves every list intact', () => {
    const { store, setPairs } = setup()
    const [a, b, c] = threeSeededLists()
    store.setLists([a, b, c])
    setPairs(a.pairs)
    confirmMock.mockReturnValue(false)

    void store.handleClearAllLists()

    expect(store.lists().map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })
})
