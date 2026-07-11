// Exercises the real IndexedDB code path (db.ts + drafts.ts) against an
// in-memory IndexedDB implementation, since vitest's default environment has
// no `indexedDB` global. This is the one integration-style test in the
// storage layer; schema.ts's pure serialize/deserialize logic is covered
// exhaustively in draftSchema.test.ts without needing IndexedDB at all.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { loadDraft, saveDraft } from '../src/lib/storage/drafts'

afterEach(async () => {
  // Clear the single draft slot so tests don't leak state into each other.
  await saveDraft([])
})

describe('loadDraft / saveDraft', () => {
  test('loadDraft resolves null when nothing has been saved', async () => {
    await expect(loadDraft()).resolves.toBeNull()
  })

  test('round-trips pairs written by saveDraft', async () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    await saveDraft(pairs)
    await expect(loadDraft()).resolves.toEqual(pairs)
  })

  test('saving replaces the previous draft rather than merging', async () => {
    await saveDraft([{ front: 'Apple', back: 'りんご' }])
    await saveDraft([{ front: 'Banana', back: 'ばなな' }])
    await expect(loadDraft()).resolves.toEqual([{ front: 'Banana', back: 'ばなな' }])
  })

  test('saving an empty pairs list clears any existing draft', async () => {
    await saveDraft([{ front: 'Apple', back: 'りんご' }])
    await saveDraft([])
    await expect(loadDraft()).resolves.toBeNull()
  })
})
