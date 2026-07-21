// Exercises the one-time upgrade path from the pre-carousel "single
// autosaved draft" model (drafts.ts's 'current' key) to the "carousel of
// documents" model (lists.ts + active.ts) against an in-memory IndexedDB
// implementation, mirroring the other storage integration tests.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { clearActiveListId, getActiveListId, setActiveListId } from './active'
import { loadDraft } from './drafts'
import { idbDel, idbPut } from './db'
import { clearAllLists, listSaved } from './lists'
import { migrateLegacyDraft } from './migrate'
import { serializeDraft } from './schema'
import type { Pair } from '../types'

const DRAFT_STORE = 'drafts'
const DRAFT_KEY = 'current'

// Simulates the legacy write path (retired with the carousel): a serialized
// Draft under the 'current' key, exactly what a pre-carousel build persisted.
async function writeLegacyDraft(pairs: Pair[]): Promise<void> {
  await idbPut(DRAFT_STORE, serializeDraft(pairs, Date.now()), DRAFT_KEY)
}

afterEach(async () => {
  await clearActiveListId()
  await clearAllLists()
  await idbDel(DRAFT_STORE, DRAFT_KEY)
})

describe('migrateLegacyDraft', () => {
  test('a non-empty legacy draft is folded into a new list, set active, and removed', async () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    await writeLegacyDraft(pairs)

    const newId = await migrateLegacyDraft()

    expect(newId).not.toBeNull()
    await expect(getActiveListId()).resolves.toBe(newId)

    const lists = await listSaved()
    expect(lists).toHaveLength(1)
    expect(lists[0].id).toBe(newId)
    expect(lists[0].pairs).toEqual(pairs)

    // The legacy draft slot is gone so it can't be migrated again.
    await expect(loadDraft()).resolves.toBeNull()
  })

  test('is idempotent: a second call does nothing once an active list is set', async () => {
    await writeLegacyDraft([{ front: 'Apple', back: 'りんご' }])
    const firstId = await migrateLegacyDraft()
    const secondResult = await migrateLegacyDraft()

    expect(secondResult).toBeNull()
    await expect(getActiveListId()).resolves.toBe(firstId)
    expect(await listSaved()).toHaveLength(1)
  })

  test('does nothing when an active list is already set, even with a legacy draft present', async () => {
    // Simulate a fresh-carousel user who somehow still has a stray legacy
    // draft lying around (e.g. from a partially-completed prior migration
    // attempt) — the active pointer takes precedence and the draft is left
    // untouched.
    await setActiveListId('already-active')
    await writeLegacyDraft([{ front: 'Apple', back: 'りんご' }])

    const result = await migrateLegacyDraft()

    expect(result).toBeNull()
    await expect(getActiveListId()).resolves.toBe('already-active')
    expect(await listSaved()).toHaveLength(0)
    // The legacy draft is left untouched — migration only runs when there's
    // no active list yet.
    await expect(loadDraft()).resolves.toEqual([{ front: 'Apple', back: 'りんご' }])
  })

  test('resolves null and clears the slot when there is no legacy draft', async () => {
    const result = await migrateLegacyDraft()
    expect(result).toBeNull()
    await expect(getActiveListId()).resolves.toBeNull()
    expect(await listSaved()).toHaveLength(0)
  })

  test('resolves null when the legacy draft is present but empty', async () => {
    await writeLegacyDraft([]) // an empty-pairs draft is treated the same as "absent"
    const result = await migrateLegacyDraft()
    expect(result).toBeNull()
    await expect(getActiveListId()).resolves.toBeNull()
  })
})
