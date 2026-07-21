// commitActiveEdits (the shared "leave this card" step) and the debounced-
// save vs. delete race it exists to guard against — plus flushSave, the
// same guard's synchronous-write sibling used on pagehide/visibilitychange.
// See useListStore.testHelpers.ts for the shared setup/cleanup.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getList } from './storage/lists'
import type { SavedList } from './storage/schema'
import { cleanupListStoreTest, flushIndexedDb, setup, stubBrowserGlobals } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

describe('commitActiveEdits', () => {
  test('an empty active card evaporates: removed from lists, never persisted', async () => {
    const { store } = setup()
    store.createNewList() // fresh memory-only card, appended + active, pairs stays []

    const id = store.activeList()!.id
    const before = store.lists().length
    const synced = store.commitActiveEdits()

    expect(synced.some((l) => l.id === id)).toBe(false)
    expect(synced.length).toBe(before - 1)
    expect(await getList(id)).toBeNull()
  })

  test('a non-empty active card is persisted (first real write of a memory-only card)', async () => {
    const { store, setPairs } = setup()
    store.createNewList()
    const id = store.activeList()!.id
    setPairs([{ front: 'a', back: 'b' }])

    store.commitActiveEdits()
    await vi.waitFor(async () => {
      expect(await getList(id)).not.toBeNull()
    })
    const saved = await getList(id)
    expect(saved!.pairs).toEqual([{ front: 'a', back: 'b' }])
  })
})

describe('debounced save vs. delete race (doPersist tombstone guard)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('a scheduled save that fires after the same card was deleted does not resurrect it', async () => {
    const { store } = setup()
    store.createNewList()
    const card = store.activeList()!
    store.setLists([{ ...card, pairs: [{ front: 'a', back: 'b' }] }])

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    store.scheduleSave(card.id, [{ front: 'a', back: 'b' }], card.createdAt)
    // The card is deleted (tombstoned) before the debounce timer fires — e.g.
    // the user typed, then immediately deleted the card from the sidebar.
    store.deleteCurrentList()
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await flushIndexedDb()

    expect(await getList(card.id)).toBeNull()
  })

  test('a scheduled save for an ALREADY-PERSISTED card is unaffected by an unrelated card being deleted', async () => {
    const { store, setPairs } = setup()
    store.createNewList()
    const untouched = store.activeList()!
    setPairs([{ front: 'x', back: 'y' }])
    store.commitActiveEdits()
    await vi.waitFor(async () => {
      expect(await getList(untouched.id)).not.toBeNull()
    })

    // A second, unrelated card added directly — not via createNewList/
    // navigate, which would re-evaluate the (still 'x'/'y') pairs() signal
    // against `untouched` again and redundantly re-persist it, racing the
    // scheduleSave below.
    const other: SavedList = { v: 1, id: 'other-1', pairs: [], createdAt: Date.now(), updatedAt: Date.now() }
    store.setLists([...store.lists(), other])

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    store.scheduleSave(untouched.id, [{ front: 'x', back: 'y2' }], untouched.createdAt)
    store.deleteListById(other.id) // not the active card — exercises deleteListById's own delete path
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await flushIndexedDb()

    const saved = await getList(untouched.id)
    expect(saved).not.toBeNull()
    expect(saved!.pairs).toEqual([{ front: 'x', back: 'y2' }])
    expect(await getList(other.id)).toBeNull()
  })
})

describe('flushSave', () => {
  test('writes the pending save immediately in a single transaction, bypassing the debounce timer', async () => {
    const { store } = setup()
    store.createNewList()
    const card = store.activeList()!

    store.scheduleSave(card.id, [{ front: 'a', back: 'b' }], card.createdAt)
    store.flushSave() // pagehide/visibilitychange — must not wait for SAVE_DEBOUNCE_MS

    await flushIndexedDb()
    const saved = await getList(card.id)
    expect(saved).not.toBeNull()
    expect(saved!.pairs).toEqual([{ front: 'a', back: 'b' }])
  })

  test('is a no-op when nothing is scheduled — a hide with no pending edits cannot re-write a card', async () => {
    const { store, setPairs } = setup()
    store.createNewList()
    const id = store.activeList()!.id
    setPairs([{ front: 'a', back: 'b' }])
    store.commitActiveEdits()
    await vi.waitFor(async () => {
      expect(await getList(id)).not.toBeNull()
    })
    const before = await getList(id)

    store.flushSave() // no scheduleSave since the commit above — should do nothing
    await flushIndexedDb()

    const after = await getList(id)
    expect(after!.updatedAt).toBe(before!.updatedAt)
  })

  test('an empty pending save is a delete, matching doPersist', async () => {
    const { store, setPairs } = setup()
    store.createNewList()
    const id = store.activeList()!.id
    setPairs([{ front: 'a', back: 'b' }])
    store.commitActiveEdits()
    await vi.waitFor(async () => {
      expect(await getList(id)).not.toBeNull()
    })

    store.scheduleSave(id, [], store.activeList()!.createdAt)
    store.flushSave()
    await flushIndexedDb()

    expect(await getList(id)).toBeNull()
  })

  test('a tombstoned id is skipped, same as doPersist', async () => {
    const { store } = setup()
    store.createNewList()
    const card = store.activeList()!
    store.setLists([{ ...card, pairs: [{ front: 'a', back: 'b' }] }])

    store.scheduleSave(card.id, [{ front: 'a', back: 'b' }], card.createdAt)
    store.deleteCurrentList() // tombstones card.id, cancels the pending save internally too
    store.flushSave() // saveTimer is already null (cancelled) — nothing to flush anyway

    await flushIndexedDb()
    expect(await getList(card.id)).toBeNull()
  })
})
