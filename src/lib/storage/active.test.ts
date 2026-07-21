// Exercises the real IndexedDB code path (db.ts + active.ts) against an
// in-memory IndexedDB implementation, mirroring drafts.test.ts's approach —
// the active-list pointer lives in the same 'drafts' store, under its own
// 'active' key, alongside the pre-carousel 'current' draft key.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { clearActiveListId, getActiveListId, setActiveListId } from './active'

afterEach(async () => {
  await clearActiveListId()
})

describe('getActiveListId / setActiveListId / clearActiveListId', () => {
  test('getActiveListId resolves null when nothing has been set', async () => {
    await expect(getActiveListId()).resolves.toBeNull()
  })

  test('round-trips an id written by setActiveListId', async () => {
    await setActiveListId('list-123')
    await expect(getActiveListId()).resolves.toBe('list-123')
  })

  test('setting again replaces the previous active id', async () => {
    await setActiveListId('list-1')
    await setActiveListId('list-2')
    await expect(getActiveListId()).resolves.toBe('list-2')
  })

  test('clearActiveListId removes the pointer', async () => {
    await setActiveListId('list-1')
    await clearActiveListId()
    await expect(getActiveListId()).resolves.toBeNull()
  })
})
