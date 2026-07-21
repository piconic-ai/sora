// Verifies the v1 -> v2 IndexedDB migration in db.ts's `upgrade()`: a browser
// that already has the 'sora' database at v1 (drafts store only, from before
// the history feature shipped) must, on the next open, gain a usable 'lists'
// store *without* losing its existing drafts data.
//
// The v1 database is created here via the raw indexedDB API (bypassing
// db.ts entirely) so this test doesn't depend on db.ts's current
// DB_VERSION/upgrade logic to construct its own "before" state — only the
// real migration path (openSoraDb() opening at v2 against an existing v1
// database) is exercised via db.ts's public idb* helpers.
import 'fake-indexeddb/auto'
import { describe, expect, test } from 'vitest'
import { idbGet, idbGetAll, idbPut } from './db'

function seedV1Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sora', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts')
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('drafts', 'readwrite')
      tx.objectStore('drafts').put({ v: 1, pairs: [{ front: 'Apple', back: 'りんご' }], updatedAt: 1 }, 'current')
      tx.oncomplete = () => {
        // Close before db.ts's openSoraDb() reopens at v2 — otherwise this
        // connection (still on v1) blocks the version-change upgrade.
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}

describe('IndexedDB v1 -> v2 migration', () => {
  test('upgrading from v1 keeps existing drafts and adds a usable lists store', async () => {
    await seedV1Database()

    // Any db.ts call now opens 'sora' at its current DB_VERSION (2) against
    // the v1 database seeded above, triggering upgrade(db, oldVersion=1).
    const draft = await idbGet<{ v: number; pairs: unknown[]; updatedAt: number }>('drafts', 'current')
    expect(draft).toEqual({ v: 1, pairs: [{ front: 'Apple', back: 'りんご' }], updatedAt: 1 })

    // The 'lists' store (added by the oldVersion < 2 branch) must now exist
    // and be writable/readable via the same in-line-key idbPut path lists.ts
    // uses.
    await idbPut('lists', { v: 1, id: 'list-1', pairs: [], createdAt: 1 })
    const lists = await idbGetAll<{ v: number; id: string; pairs: unknown[]; createdAt: number }>('lists')
    expect(lists).toEqual([{ v: 1, id: 'list-1', pairs: [], createdAt: 1 }])
  })
})
