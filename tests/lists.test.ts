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
import {
  clearAllLists,
  createList,
  deleteList,
  getList,
  listSaved,
  putListDirect,
  renameList,
  updateList,
} from '../src/lib/storage/lists'
import { serializeList } from '../src/lib/storage/schema'

afterEach(async () => {
  // Clear the store so tests don't leak state into each other.
  await clearAllLists()
  vi.restoreAllMocks()
})

describe('listSaved', () => {
  test('returns a created entry', async () => {
    await createList([{ front: 'Apple', back: 'りんご' }])
    const lists = await listSaved()
    expect(lists).toHaveLength(1)
    expect(lists[0].pairs).toEqual([{ front: 'Apple', back: 'りんご' }])
  })

  test('returns entries newest first (createdAt descending)', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    await createList([{ front: 'A', back: 'a' }])
    now = 2000
    await createList([{ front: 'B', back: 'b' }])
    now = 3000
    await createList([{ front: 'C', back: 'c' }])

    const lists = await listSaved()
    expect(lists.map((l) => l.pairs[0].front)).toEqual(['C', 'B', 'A'])
    expect(lists.map((l) => l.createdAt)).toEqual([3000, 2000, 1000])
  })

  test('resolves empty when nothing has been created', async () => {
    expect(await listSaved()).toHaveLength(0)
  })
})

describe('putListDirect', () => {
  test('writes a fully-formed record in one shot, retrievable via getList', async () => {
    const rec = serializeList('direct-1', [{ front: 'Apple', back: 'りんご' }], 1000, 2000)
    await putListDirect(rec)
    await expect(getList('direct-1')).resolves.toEqual(rec)
  })

  test('overwrites an existing record without a read-back or dedup', async () => {
    const created = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'direct-2', createdAt: 500 })
    // Same id/createdAt, new pairs + updatedAt — a straight overwrite, even
    // though updateList would have skipped an unchanged-content write.
    const rec = serializeList('direct-2', [{ front: 'Banana', back: 'ばなな' }], created.createdAt, 9999)
    await putListDirect(rec)
    const stored = await getList('direct-2')
    expect(stored).toEqual(rec)
    expect(stored?.createdAt).toBe(500)
    expect(stored?.updatedAt).toBe(9999)
  })

  test('does not disturb other records', async () => {
    const a = await createList([{ front: 'Apple', back: 'りんご' }])
    await putListDirect(serializeList('other', [{ front: 'Banana', back: 'ばなな' }], 1, 1))
    await expect(getList(a.id)).resolves.toEqual(a)
  })
})

describe('getList', () => {
  test('retrieves a saved list by id', async () => {
    await createList([{ front: 'Apple', back: 'りんご' }])
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

    await createList([{ front: 'Apple', back: 'りんご' }])
    now = 2000
    await createList([{ front: 'Banana', back: 'ばなな' }])
    const [latest] = await listSaved()
    await deleteList(latest.id)

    const remaining = await listSaved()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].pairs[0].front).toBe('Apple')
  })

  test('deleting an unknown id is a no-op', async () => {
    await createList([{ front: 'Apple', back: 'りんご' }])
    await deleteList('does-not-exist')
    expect(await listSaved()).toHaveLength(1)
  })
})

describe('clearAllLists', () => {
  test('empties the store', async () => {
    await createList([{ front: 'Apple', back: 'りんご' }])
    await createList([{ front: 'Banana', back: 'ばなな' }])
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

  test('overrides.id/createdAt pin the id and createdAt of a first real write, updatedAt is still now', async () => {
    let now = 9000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    now = 10000 // the moment of the actual write, distinct from the pinned createdAt
    const list = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'pinned-id', createdAt: 3000 })

    expect(list).toEqual({
      v: 1,
      id: 'pinned-id',
      pairs: [{ front: 'Apple', back: 'りんご' }],
      createdAt: 3000,
      updatedAt: 10000,
    })
    await expect(getList('pinned-id')).resolves.toEqual(list)
  })

  test('a partial overrides object falls back to generated id / now createdAt for the missing field', async () => {
    let now = 4000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const list = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'pinned-only' })
    expect(list.id).toBe('pinned-only')
    expect(list.createdAt).toBe(4000)
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

  // The title-preservation trap: serializeList rebuilds the whole record, so
  // without threading the stored title back through, an autosave (pairs
  // update) would silently wipe a renamed list's custom name.
  test('preserves a custom title across a pairs update', async () => {
    const created = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'titled', title: 'Fruits' })
    expect(created.title).toBe('Fruits')

    await updateList('titled', [{ front: 'Apple', back: 'りんご' }, { front: 'Banana', back: 'ばなな' }])

    const updated = await getList('titled')
    expect(updated?.title).toBe('Fruits')
    expect(updated?.pairs).toHaveLength(2)
  })
})

describe('createList with a title override', () => {
  test('persists the title on the first real write', async () => {
    const list = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'c-titled', title: 'Fruits' })
    expect(list.title).toBe('Fruits')
    await expect(getList('c-titled')).resolves.toMatchObject({ title: 'Fruits' })
  })

  test('a blank title override is dropped (no title key)', async () => {
    const list = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'c-blank', title: '   ' })
    expect(list.title).toBeUndefined()
  })
})

describe('putListDirect preserves a title (flush-path regression)', () => {
  test('a fully-formed record carrying a title round-trips through putListDirect', async () => {
    const rec = serializeList('flush-titled', [{ front: 'Apple', back: 'りんご' }], 1000, 2000, 'Fruits')
    await putListDirect(rec)
    await expect(getList('flush-titled')).resolves.toMatchObject({ title: 'Fruits' })
  })
})

describe('renameList', () => {
  test('sets a custom title, preserving pairs/id/createdAt and advancing updatedAt', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const created = await createList([{ front: 'Apple', back: 'りんご' }], { id: 'r-1' })
    now = 2000
    await renameList('r-1', 'My Fruits')

    const renamed = await getList('r-1')
    expect(renamed).toEqual({
      v: 1,
      id: 'r-1',
      pairs: [{ front: 'Apple', back: 'りんご' }],
      createdAt: created.createdAt,
      updatedAt: 2000,
      title: 'My Fruits',
    })
  })

  test('an empty/blank title clears the stored title', async () => {
    await createList([{ front: 'Apple', back: 'りんご' }], { id: 'r-2', title: 'Fruits' })
    await renameList('r-2', '   ')

    const cleared = await getList('r-2')
    expect(cleared?.title).toBeUndefined()
    expect(cleared?.pairs).toEqual([{ front: 'Apple', back: 'りんご' }])
  })

  test('trims the title', async () => {
    await createList([{ front: 'Apple', back: 'りんご' }], { id: 'r-3' })
    await renameList('r-3', '  Spaced  ')
    await expect(getList('r-3')).resolves.toMatchObject({ title: 'Spaced' })
  })

  test('is a no-op for an id that does not exist', async () => {
    await renameList('does-not-exist', 'Ghost')
    expect(await listSaved()).toHaveLength(0)
  })
})
