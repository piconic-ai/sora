// Exercises the real IndexedDB code path (db.ts + lists.ts) against an
// in-memory IndexedDB implementation, since vitest's default environment has
// no `indexedDB` global — mirrors drafts.test.ts's approach for the 'drafts'
// store. schema.ts's pure serialize/deserialize/pairsEqual logic is covered
// exhaustively in listSchema.test.ts without needing IndexedDB at all.
//
// Timestamps are controlled via a `Date.now` spy rather than
// `vi.useFakeTimers()`: fake-indexeddb schedules its async completion
// callbacks through `setImmediate` (see its lib/scheduling.js), which fake
// timers would also intercept and never fire unless manually advanced —
// spying on `Date.now` alone avoids that trap entirely.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { clearAllLists, deleteList, getList, listSaved, saveList } from '../src/lib/storage/lists'

afterEach(async () => {
  // Clear the store so tests don't leak state into each other.
  await clearAllLists()
  vi.restoreAllMocks()
})

describe('saveList / listSaved', () => {
  test('creates a new entry retrievable via listSaved', async () => {
    await saveList([{ front: 'Apple', back: 'りんご' }])
    const lists = await listSaved()
    expect(lists).toHaveLength(1)
    expect(lists[0].pairs).toEqual([{ front: 'Apple', back: 'りんご' }])
  })

  test('does not save an empty pairs list', async () => {
    await saveList([])
    expect(await listSaved()).toHaveLength(0)
  })

  test('skips saving a duplicate of the most recently saved list', async () => {
    const pairs = [{ front: 'Apple', back: 'りんご' }]
    await saveList(pairs)
    await saveList(pairs)
    await saveList([{ front: 'Apple', back: 'りんご' }]) // distinct array, equal content
    expect(await listSaved()).toHaveLength(1)
  })

  test('saves again once the content differs from the most recent entry', async () => {
    await saveList([{ front: 'Apple', back: 'りんご' }])
    await saveList([{ front: 'Banana', back: 'ばなな' }])
    expect(await listSaved()).toHaveLength(2)
  })

  test('a duplicate of an older (non-latest) entry is still saved', async () => {
    await saveList([{ front: 'Apple', back: 'りんご' }])
    await saveList([{ front: 'Banana', back: 'ばなな' }])
    await saveList([{ front: 'Apple', back: 'りんご' }]) // equals entry[0], not entry[-1] (latest)
    expect(await listSaved()).toHaveLength(3)
  })

  test('listSaved returns entries newest first', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    await saveList([{ front: 'A', back: 'a' }])
    now = 2000
    await saveList([{ front: 'B', back: 'b' }])
    now = 3000
    await saveList([{ front: 'C', back: 'c' }])

    const lists = await listSaved()
    expect(lists.map((l) => l.pairs[0].front)).toEqual(['C', 'B', 'A'])
    expect(lists.map((l) => l.createdAt)).toEqual([3000, 2000, 1000])
  })

  test('caps at 50 entries: the 51st save evicts the oldest, keeping 50', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    for (let i = 0; i < 51; i++) {
      now = 1000 + i
      await saveList([{ front: `word${i}`, back: `back${i}` }])
    }

    const lists = await listSaved()
    expect(lists).toHaveLength(50)
    // word0 was the oldest (first saved) and should have been evicted;
    // word1..word50 (50 entries) remain, newest (word50) first.
    expect(lists.some((l) => l.pairs[0].front === 'word0')).toBe(false)
    expect(lists.some((l) => l.pairs[0].front === 'word1')).toBe(true)
    expect(lists[0].pairs[0].front).toBe('word50')
    expect(lists[49].pairs[0].front).toBe('word1')
  })
})

describe('getList', () => {
  test('retrieves a saved list by id', async () => {
    await saveList([{ front: 'Apple', back: 'りんご' }])
    const [saved] = await listSaved()
    await expect(getList(saved.id)).resolves.toEqual(saved)
  })

  test('resolves null for an unknown id', async () => {
    await expect(getList('does-not-exist')).resolves.toBeNull()
  })
})

describe('deleteList', () => {
  test('removes exactly the targeted entry', async () => {
    // Distinct createdAt values so listSaved()'s createdAt-desc sort has a
    // deterministic order to assert on — two saves within the same real
    // clock millisecond would otherwise tie, and the tie-break (insertion
    // order into the underlying store) isn't something this test cares
    // about.
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    await saveList([{ front: 'Apple', back: 'りんご' }])
    now = 2000
    await saveList([{ front: 'Banana', back: 'ばなな' }])
    const [latest] = await listSaved()
    await deleteList(latest.id)

    const remaining = await listSaved()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].pairs[0].front).toBe('Apple')
  })

  test('deleting an unknown id is a no-op', async () => {
    await saveList([{ front: 'Apple', back: 'りんご' }])
    await deleteList('does-not-exist')
    expect(await listSaved()).toHaveLength(1)
  })
})

describe('clearAllLists', () => {
  test('empties the store', async () => {
    await saveList([{ front: 'Apple', back: 'りんご' }])
    await saveList([{ front: 'Banana', back: 'ばなな' }])
    await clearAllLists()
    expect(await listSaved()).toHaveLength(0)
  })
})
