// initialize()'s URL/stored-active-pointer/newest resolution order, first-
// ever-visit sample seeding, and the userInteracted-during-startup merge
// path. See useListStore.testHelpers.ts for the shared setup/cleanup.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createList } from './storage/lists'
import { setActiveListId } from './storage/active'
import { cleanupListStoreTest, setup, stubBrowserGlobals, threeSeededLists } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

describe('initialize: which list becomes active', () => {
  test('first-ever visit (nothing saved) seeds and opens the sample list', async () => {
    const { store } = setup()
    await store.initialize()

    expect(store.lists().length).toBe(1)
    expect(store.activeList()!.title).toBeDefined()
  })

  test("the URL's /l/{id} wins over the stored active pointer", async () => {
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
