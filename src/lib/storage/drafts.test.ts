// Exercises the real IndexedDB code path (db.ts + drafts.ts) against an
// in-memory IndexedDB implementation, since vitest's default environment has
// no `indexedDB` global. drafts.ts is now read-only (loadDraft) — the legacy
// draft slot is written only by pre-carousel builds and read here so
// migrateLegacyDraft can fold it into a list; the write is simulated with a
// direct idbPut of a serializeDraft record. schema.ts's pure serialize/
// deserialize logic is covered exhaustively in draftSchema.test.ts.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'
import { loadDraft } from './drafts'
import { idbDel, idbPut } from './db'
import { serializeDraft } from './schema'
import type { Pair } from '../types'

const STORE = 'drafts'
const KEY = 'current'

// Writes a legacy draft record the way a pre-carousel build would have — a
// serialized Draft under the 'current' key of the 'drafts' store.
async function writeLegacyDraft(pairs: Pair[]): Promise<void> {
  await idbPut(STORE, serializeDraft(pairs, Date.now()), KEY)
}

afterEach(async () => {
  // Clear the single draft slot so tests don't leak state into each other.
  await idbDel(STORE, KEY)
})

describe('loadDraft', () => {
  test('resolves null when nothing has been written', async () => {
    await expect(loadDraft()).resolves.toBeNull()
  })

  test('returns the pairs of a stored legacy draft', async () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    await writeLegacyDraft(pairs)
    await expect(loadDraft()).resolves.toEqual(pairs)
  })

  test('resolves null for a malformed / wrong-version stored value', async () => {
    await idbPut(STORE, { v: 2, pairs: [], updatedAt: 1 }, KEY)
    await expect(loadDraft()).resolves.toBeNull()
  })
})
