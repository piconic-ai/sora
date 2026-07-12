// Exercises the one-time upgrade path from the pre-carousel "single
// autosaved draft" model (drafts.ts's 'current' key) to the "carousel of
// documents" model (lists.ts + active.ts) against an in-memory IndexedDB
// implementation, mirroring the other storage integration tests.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { clearActiveListId, getActiveListId, setActiveListId } from '../src/lib/storage/active'
import { loadDraft, saveDraft } from '../src/lib/storage/drafts'
import { clearAllLists, listSaved } from '../src/lib/storage/lists'
import { migrateLegacyDraft } from '../src/lib/storage/migrate'

afterEach(async () => {
  await clearActiveListId()
  await clearAllLists()
  await saveDraft([])
})

describe('migrateLegacyDraft', () => {
  test('a non-empty legacy draft is folded into a new list, set active, and removed', async () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    await saveDraft(pairs)

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
    await saveDraft([{ front: 'Apple', back: 'りんご' }])
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
    await saveDraft([{ front: 'Apple', back: 'りんご' }])

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
    await saveDraft([]) // saveDraft([]) itself deletes the slot, so this is the same as "absent"
    const result = await migrateLegacyDraft()
    expect(result).toBeNull()
    await expect(getActiveListId()).resolves.toBeNull()
  })
})
