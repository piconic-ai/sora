// useListStore is a BarefootJS reactive factory (createSignal/createMemo),
// but those are plain runtime primitives outside of compiled component
// context — calling it directly here, uncompiled, exercises the exact same
// closures App.tsx's compiled call site does. pairs/t/setSidebarOpen/
// isNarrowViewport are injected params (see useListStore's own docstring),
// so they're trivially fakeable; window.confirm/history/location/document/
// requestAnimationFrame are real browser globals the store touches directly
// and aren't injected, so they're stubbed per-test below (vitest's default
// environment is Node, with none of these present).
//
// fake-indexeddb schedules its own async completion via setImmediate (see
// lists.test.ts's comment) — vi.useFakeTimers is scoped to `toFake:
// ['setTimeout', 'clearTimeout']` wherever used below so it never touches
// that, mirroring lists.test.ts's Date.now-spy-not-full-fake-timers stance.
// Even so, `vi.advanceTimersByTimeAsync` firing scheduleSave's setTimeout
// callback only guarantees doPersist/doPersist's *synchronous* portion has
// run — its internal `await getList(...)`/`await createList(...)` chain
// resolves through fake-indexeddb's real setImmediate queue, one or more
// ticks later. Confirmed empirically: without flushIndexedDb() below, a
// scheduleSave's eventual write is sometimes still not observable
// immediately after advanceTimersByTimeAsync resolves.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createSignal } from '@barefootjs/client'
import { useListStore } from '../src/lib/useListStore'
import { MAX_LISTS, clearAllLists, createList, getList } from '../src/lib/storage/lists'
import { clearActiveListId, setActiveListId } from '../src/lib/storage/active'
import { messages } from '../src/lib/i18n'
import type { Pair } from '../src/lib/types'
import type { SavedList } from '../src/lib/storage/schema'

let confirmMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  confirmMock = vi.fn(() => true)
  vi.stubGlobal('window', { confirm: confirmMock })
  vi.stubGlobal('history', { replaceState: vi.fn() })
  vi.stubGlobal('location', { pathname: '/' })
  vi.stubGlobal('document', { querySelector: vi.fn(() => null) })
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn()
    return 0
  })
})

afterEach(async () => {
  // Several store methods (commitActiveEdits, createNewList, ...) fire
  // doPersist/deleteList as fire-and-forget (`void ...`) — a test that
  // doesn't itself await that write can finish and hit clearAllLists()
  // below while the write is still in flight, landing it AFTER the clear
  // and leaking a stray record into whichever test runs next (confirmed
  // empirically: without this flush, "first-ever visit" intermittently saw
  // a leftover record from an earlier test and skipped its sample-seeding
  // branch). Flush before clearing, not after, so nothing outruns the clear.
  await flushIndexedDb()
  // fake-indexeddb persists its backing store across tests in the same file
  // (a single IDBFactory instance) — both the 'lists' store and the
  // 'drafts' store's 'active' pointer key must be reset, or a later test's
  // initialize()/getActiveListId() read could see a stale value left by an
  // earlier one.
  await clearAllLists()
  await clearActiveListId()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setup() {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const setSidebarOpen = vi.fn()
  const store = useListStore(pairs, () => messages.ja, setSidebarOpen, () => false)
  return { store, setPairs, setSidebarOpen }
}

// Lets fake-indexeddb's real-setImmediate-scheduled completion callbacks
// (queued by a doPersist that just ran inside a faked setTimeout) actually
// run, by yielding the real event loop a few times. See the file-header
// comment for why advanceTimersByTimeAsync alone isn't sufficient.
async function flushIndexedDb() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

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

describe('createNewList: MAX_LISTS eviction', () => {
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

// navigate/selectList settle the outgoing card via commitActiveEdits, which
// reads the shared pairs() signal — moving `pairs()` to match the currently-
// active seeded card's own content before switching keeps a multi-card
// setup array intact instead of evaporating whatever was last active.
function moveActiveTo(store: ReturnType<typeof useListStore>, setPairs: (p: Pair[]) => void, id: string) {
  setPairs(store.activeList()!.pairs)
  store.selectList(id)
}

function threeSeededLists(now = Date.now()): [SavedList, SavedList, SavedList] {
  const a: SavedList = { v: 1, id: 'a', pairs: [{ front: 'A', back: 'a' }], createdAt: now, updatedAt: now }
  const b: SavedList = { v: 1, id: 'b', pairs: [{ front: 'B', back: 'b' }], createdAt: now + 1, updatedAt: now + 1 }
  const c: SavedList = { v: 1, id: 'c', pairs: [{ front: 'C', back: 'c' }], createdAt: now + 2, updatedAt: now + 2 }
  return [a, b, c]
}

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

describe('navigate / selectList', () => {
  test('selecting the already-active list is a no-op', () => {
    const { store, setPairs } = setup()
    const [a, b] = threeSeededLists()
    store.setLists([a, b])
    setPairs(a.pairs)

    store.selectList(a.id)

    expect(store.lists().map((l) => l.id)).toEqual(['a', 'b'])
    expect(store.activeList()!.id).toBe('a')
  })

  test('selecting a different list by id switches the editor to it', () => {
    const { store, setPairs } = setup()
    const [a, b, c] = threeSeededLists()
    store.setLists([a, b, c])
    setPairs(a.pairs)

    store.selectList(c.id)

    expect(store.activeList()!.id).toBe('c')
  })

  test('an unknown id is silently ignored', () => {
    const { store, setPairs } = setup()
    const [a, b] = threeSeededLists()
    store.setLists([a, b])
    setPairs(a.pairs)

    store.selectList('does-not-exist')

    expect(store.activeList()!.id).toBe('a')
  })

  test('narrow viewport: selecting a list closes the sidebar drawer even when re-selecting the active one', () => {
    const [pairs, setPairs] = createSignal<Pair[]>([])
    const setSidebarOpen = vi.fn()
    const store = useListStore(pairs, () => messages.ja, setSidebarOpen, () => true) // narrow
    const [a] = threeSeededLists()
    store.setLists([a])
    setPairs(a.pairs)

    store.selectList(a.id) // re-selecting the already-active list — the drawer-close still runs

    expect(setSidebarOpen).toHaveBeenCalledWith(false)
  })

  test('wide viewport: selecting a list never touches the sidebar', () => {
    const { store, setPairs, setSidebarOpen } = setup()
    const [a, b] = threeSeededLists()
    store.setLists([a, b])
    setPairs(a.pairs)

    store.selectList(b.id)

    expect(setSidebarOpen).not.toHaveBeenCalled()
  })
})

describe('initialize: which list becomes active', () => {
  test('first-ever visit (nothing saved) seeds and opens the sample list', async () => {
    const { store } = setup()
    await store.initialize()

    expect(store.lists().length).toBe(1)
    expect(store.activeList()!.title).toBeDefined()
  })

  test('the URL\'s /l/{id} wins over the stored active pointer', async () => {
    const { store } = setup()
    const [a, b] = threeSeededLists()
    await createList(a.pairs, { id: a.id, createdAt: a.createdAt, title: a.title })
    await createList(b.pairs, { id: b.id, createdAt: b.createdAt, title: b.title })
    await setActiveListId(a.id)
    vi.stubGlobal('location', { pathname: `/l/${b.id}` })

    await store.initialize()

    expect(store.activeList()!.id).toBe(b.id)
  })

  test('an unknown URL id falls back to the stored active pointer', async () => {
    const { store } = setup()
    const [a, b] = threeSeededLists()
    await createList(a.pairs, { id: a.id, createdAt: a.createdAt, title: a.title })
    await createList(b.pairs, { id: b.id, createdAt: b.createdAt, title: b.title })
    await setActiveListId(b.id)
    vi.stubGlobal('location', { pathname: '/l/does-not-exist' })

    await store.initialize()

    expect(store.activeList()!.id).toBe(b.id)
  })

  test('no URL id and no stored pointer falls back to the most recently created list', async () => {
    const { store } = setup()
    const [a, b] = threeSeededLists()
    await createList(a.pairs, { id: a.id, createdAt: a.createdAt, title: a.title })
    await createList(b.pairs, { id: b.id, createdAt: b.createdAt, title: b.title })

    await store.initialize()

    expect(store.activeList()!.id).toBe(b.id) // b was created later (see threeSeededLists)
  })

  test('typing during the async startup window is preserved as a fresh newest card, not clobbered', async () => {
    const { store, setPairs } = setup()
    const [a] = threeSeededLists()
    await createList(a.pairs, { id: a.id, createdAt: a.createdAt, title: a.title })
    setPairs([{ front: 'typed', back: 'during startup' }])
    store.markUserInteracted()

    await store.initialize()

    expect(store.lists().length).toBe(2)
    expect(store.activeList()!.pairs).toEqual([{ front: 'typed', back: 'during startup' }])
  })
})
