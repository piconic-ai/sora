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
import { clearAllLists, createList, deleteList, getList, listSaved, saveList, updateList } from '../src/lib/storage/lists'

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

  test('a duplicate of an older (non-latest) entry is not saved either', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    await saveList([{ front: 'Apple', back: 'りんご' }])
    now = 2000
    await saveList([{ front: 'Banana', back: 'ばなな' }])
    now = 3000
    await saveList([{ front: 'Apple', back: 'りんご' }]) // equals the older entry, not the latest one
    const lists = await listSaved()
    expect(lists).toHaveLength(2)
    expect(lists.map((l) => l.pairs[0].front)).toEqual(['Banana', 'Apple'])
  })

  test('checks against every existing entry, not just the latest, with the oldest matched', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    await saveList([{ front: 'Apple', back: 'りんご' }])
    now = 2000
    await saveList([{ front: 'Banana', back: 'ばなな' }])
    now = 3000
    await saveList([{ front: 'Cherry', back: 'さくらんぼ' }])
    now = 4000
    await saveList([{ front: 'Apple', back: 'りんご' }]) // matches the oldest of the three
    const lists = await listSaved()
    expect(lists).toHaveLength(3)
    expect(lists.map((l) => l.pairs[0].front)).toEqual(['Cherry', 'Banana', 'Apple'])
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

describe('createList', () => {
  test('creates a new document-mode list with a fresh id and createdAt == updatedAt', async () => {
    let now = 5000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const pairs = [{ front: 'Apple', back: 'りんご' }]
    const list = await createList(pairs)

    expect(list.pairs).toEqual(pairs)
    expect(list.createdAt).toBe(5000)
    expect(list.updatedAt).toBe(5000)
    expect(typeof list.id).toBe('string')
    expect(list.id.length).toBeGreaterThan(0)
    await expect(getList(list.id)).resolves.toEqual(list)
  })

  test('does not dedup against existing content and does not cap at MAX_LISTS', async () => {
    const pairs = [{ front: 'Apple', back: 'りんご' }]
    await createList(pairs)
    await createList(pairs) // identical content, still creates a second entry
    expect(await listSaved()).toHaveLength(2)
  })

  test('creates distinct ids across calls', async () => {
    const a = await createList([{ front: 'Apple', back: 'りんご' }])
    const b = await createList([{ front: 'Banana', back: 'ばなな' }])
    expect(a.id).not.toBe(b.id)
  })
})

describe('updateList', () => {
  test('updates pairs in place and advances updatedAt, keeping id/createdAt', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const created = await createList([{ front: 'Apple', back: 'りんご' }])
    now = 2000
    await updateList(created.id, [{ front: 'Banana', back: 'ばなな' }])

    const updated = await getList(created.id)
    expect(updated).toEqual({
      v: 1,
      id: created.id,
      pairs: [{ front: 'Banana', back: 'ばなな' }],
      createdAt: 1000,
      updatedAt: 2000,
    })
  })

  test('skips the write when pairs are unchanged (updatedAt does not advance)', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const created = await createList([{ front: 'Apple', back: 'りんご' }])
    now = 2000
    await updateList(created.id, [{ front: 'Apple', back: 'りんご' }])

    const updated = await getList(created.id)
    expect(updated?.updatedAt).toBe(1000)
  })

  test('is a no-op for an id that does not exist', async () => {
    await updateList('does-not-exist', [{ front: 'Apple', back: 'りんご' }])
    expect(await listSaved()).toHaveLength(0)
  })

  test('does not affect other lists', async () => {
    const a = await createList([{ front: 'Apple', back: 'りんご' }])
    const b = await createList([{ front: 'Banana', back: 'ばなな' }])
    await updateList(a.id, [{ front: 'Apricot', back: 'あんず' }])

    await expect(getList(b.id)).resolves.toEqual(b)
    const updatedA = await getList(a.id)
    expect(updatedA?.pairs).toEqual([{ front: 'Apricot', back: 'あんず' }])
  })
})
