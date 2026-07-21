// persistRename's memory-only-vs-persisted split, its interaction with an
// in-flight debounced save, and title normalization. See
// useListStore.testHelpers.ts for the shared setup/cleanup.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getList } from './storage/lists'
import { cleanupListStoreTest, flushIndexedDb, setup, stubBrowserGlobals } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

describe('persistRename', () => {
  test('a still-memory-only card is not written to IndexedDB — the title only updates in-memory', async () => {
    const { store } = setup()
    store.createNewList()
    const id = store.activeList()!.id

    store.persistRename(id, '  My List  ')

    expect(store.activeList()!.title).toBe('My List')
    await flushIndexedDb()
    expect(await getList(id)).toBeNull() // never persisted — rename alone doesn't create the record
  })

  test('renaming an already-persisted list updates the stored title', async () => {
    const { store, setPairs } = setup()
    store.createNewList()
    const id = store.activeList()!.id
    setPairs([{ front: 'a', back: 'b' }])
    store.commitActiveEdits()
    await vi.waitFor(async () => {
      expect(await getList(id)).not.toBeNull()
    })

    store.persistRename(id, 'Renamed')
    await vi.waitFor(async () => {
      const saved = await getList(id)
      expect(saved!.title).toBe('Renamed')
    })
  })

  test('an in-flight scheduled save carries the new title through instead of being overwritten by the stale one', async () => {
    const { store } = setup()
    store.createNewList()
    const card = store.activeList()!
    store.setLists([{ ...card, pairs: [{ front: 'a', back: 'b' }] }])

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    store.scheduleSave(card.id, [{ front: 'a', back: 'b' }], card.createdAt)
    store.persistRename(card.id, 'New Title')
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await flushIndexedDb()

    const saved = await getList(card.id)
    expect(saved!.title).toBe('New Title')
  })

  test('an empty/whitespace name clears the title (reverts to the auto-generated label)', () => {
    const { store } = setup()
    store.createNewList()
    const id = store.activeList()!.id
    store.persistRename(id, 'Something')
    expect(store.activeList()!.title).toBe('Something')

    store.persistRename(id, '   ')

    expect(store.activeList()!.title).toBeUndefined()
  })
})
