// Shared harness for useListStore's split test files (useListStore.*.test.ts).
// Not itself a test file (no .test.ts suffix, so vitest's `src/**/*.test.ts`
// include glob skips it) — every split file imports from here instead of
// duplicating the setup.
//
// useListStore is a BarefootJS reactive factory, but createSignal/createMemo
// are plain runtime primitives outside compiled component context — calling
// it directly here, uncompiled, exercises the exact same closures App.tsx's
// compiled call site does. pairs/t/setSidebarOpen/isNarrowViewport are
// injected params (see useListStore's own docstring), so they're trivially
// fakeable; window.confirm/history/location/document/requestAnimationFrame
// are real browser globals the store touches directly and aren't injected,
// so they're stubbed via stubBrowserGlobals() (vitest's default environment
// is Node, with none of these present).
import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import { createSignal } from '@barefootjs/client'
import { useListStore } from './useListStore'
import { clearActiveListId } from './storage/active'
import { clearAllLists } from './storage/lists'
import { messages } from './i18n'
import type { Pair } from './types'
import type { SavedList } from './storage/schema'

// Reassigned by stubBrowserGlobals() each test — importers read the live
// ES-module binding, so `expect(confirmMock).toHaveBeenCalled()` in a split
// file always sees the current test's mock, not a stale one.
export let confirmMock: ReturnType<typeof vi.fn>

export function stubBrowserGlobals() {
  confirmMock = vi.fn(() => true)
  vi.stubGlobal('window', { confirm: confirmMock })
  vi.stubGlobal('history', { replaceState: vi.fn() })
  vi.stubGlobal('location', { pathname: '/' })
  vi.stubGlobal('document', { querySelector: vi.fn(() => null) })
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn()
    return 0
  })
}

export async function cleanupListStoreTest() {
  // Several store methods (commitActiveEdits, createNewList, ...) fire
  // doPersist/deleteList as fire-and-forget (`void ...`) — a test that
  // doesn't itself await that write can finish and hit clearAllLists()
  // below while the write is still in flight, landing it AFTER the clear
  // and leaking a stray record into whichever test runs next (confirmed
  // empirically: without this flush, an initialize() test intermittently
  // saw a leftover record from an earlier test and skipped its sample-
  // seeding branch). Flush before clearing, not after, so nothing outruns
  // the clear.
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
}

export function setup() {
  const [pairs, setPairs] = createSignal<Pair[]>([])
  const setSidebarOpen = vi.fn()
  const store = useListStore(pairs, () => messages.ja, setSidebarOpen, () => false)
  return { store, setPairs, setSidebarOpen }
}

// Lets fake-indexeddb's real-setImmediate-scheduled completion callbacks
// (queued by a doPersist that just ran inside a faked setTimeout) actually
// run, by yielding the real event loop a few times. `vi.advanceTimersByTimeAsync`
// firing scheduleSave's setTimeout callback only guarantees doPersist's
// *synchronous* portion has run — its internal `await getList(...)`/
// `await createList(...)` chain resolves through fake-indexeddb's real
// setImmediate queue, one or more ticks later. Confirmed empirically:
// without this, a scheduleSave's eventual write is sometimes still not
// observable immediately after advanceTimersByTimeAsync resolves.
export async function flushIndexedDb() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// navigate/selectList settle the outgoing card via commitActiveEdits, which
// reads the shared pairs() signal — moving `pairs()` to match the currently-
// active seeded card's own content before switching keeps a multi-card
// setup array intact instead of evaporating whatever was last active.
export function moveActiveTo(store: ReturnType<typeof useListStore>, setPairs: (p: Pair[]) => void, id: string) {
  setPairs(store.activeList()!.pairs)
  store.selectList(id)
}

export function threeSeededLists(now = Date.now()): [SavedList, SavedList, SavedList] {
  const a: SavedList = { v: 1, id: 'a', pairs: [{ front: 'A', back: 'a' }], createdAt: now, updatedAt: now }
  const b: SavedList = { v: 1, id: 'b', pairs: [{ front: 'B', back: 'b' }], createdAt: now + 1, updatedAt: now + 1 }
  const c: SavedList = { v: 1, id: 'c', pairs: [{ front: 'C', back: 'c' }], createdAt: now + 2, updatedAt: now + 2 }
  return [a, b, c]
}
