// navigate/selectList: no-op on the already-active list, switching by id,
// unknown ids, and the narrow-viewport drawer-close side effect. See
// useListStore.testHelpers.ts for the shared setup/cleanup.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createSignal } from '@barefootjs/client'
import { useListStore } from './useListStore'
import { messages } from './i18n'
import type { Pair } from './types'
import { cleanupListStoreTest, setup, stubBrowserGlobals, threeSeededLists } from './useListStore.testHelpers'

beforeEach(stubBrowserGlobals)
afterEach(cleanupListStoreTest)

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
