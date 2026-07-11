import type { Pair } from '../types'

// Bumping this is a breaking change for any Draft already sitting in a
// user's IndexedDB — deserializeDraft rejects (returns null) anything whose
// `v` doesn't match, so old drafts are discarded rather than misread.
export const DRAFT_VERSION = 1

export interface Draft {
  v: 1
  pairs: Pair[]
  updatedAt: number
}

function isPair(value: unknown): value is Pair {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return typeof p.front === 'string' && typeof p.back === 'string'
}

// Defensive coercion so a Draft round-trips even if front/back ever arrive
// as something other than a string (e.g. hand-edited IndexedDB content) —
// TypeScript already guarantees this for in-app callers.
function normalizePairs(pairs: Pair[]): Pair[] {
  return pairs.map((p) => ({ front: String(p.front ?? ''), back: String(p.back ?? '') }))
}

export function serializeDraft(pairs: Pair[], now: number): Draft {
  return { v: DRAFT_VERSION, pairs: normalizePairs(pairs), updatedAt: now }
}

// Validates the shape/version of whatever came out of storage and returns a
// clean Draft, or null if it can't be trusted — a version mismatch, a
// malformed shape, or (e.g.) hand-edited/corrupted IndexedDB content are all
// safely discarded rather than crashing the restore path.
export function deserializeDraft(raw: unknown): Draft | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>

  if (d.v !== DRAFT_VERSION) return null
  if (!Array.isArray(d.pairs)) return null
  if (!d.pairs.every(isPair)) return null
  if (typeof d.updatedAt !== 'number') return null

  return { v: DRAFT_VERSION, pairs: normalizePairs(d.pairs as Pair[]), updatedAt: d.updatedAt }
}

// A saved history entry — an automatic snapshot of the word list taken on
// print / "new list". Unlike Draft, it has an `id` (the IDB keyPath for the
// 'lists' store) and no title: display titles are derived on the fly from
// `pairs` + `createdAt` (see i18n.ts's historyItemTitle) rather than stored,
// so a locale switch immediately relabels every history entry.
export const LIST_VERSION = 1

export interface SavedList {
  v: 1
  id: string
  pairs: Pair[]
  createdAt: number
}

export function serializeList(id: string, pairs: Pair[], createdAt: number): SavedList {
  return { v: LIST_VERSION, id, pairs: normalizePairs(pairs), createdAt }
}

// Same discard-rather-than-throw contract as deserializeDraft: a version
// mismatch or malformed shape (hand-edited/corrupted IndexedDB content)
// returns null so listSaved() can silently drop unreadable entries instead
// of crashing the whole history popover.
export function deserializeList(raw: unknown): SavedList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>

  if (d.v !== LIST_VERSION) return null
  if (typeof d.id !== 'string' || d.id === '') return null
  if (!Array.isArray(d.pairs)) return null
  if (!d.pairs.every(isPair)) return null
  if (typeof d.createdAt !== 'number') return null

  return { v: LIST_VERSION, id: d.id, pairs: normalizePairs(d.pairs as Pair[]), createdAt: d.createdAt }
}

// Duplicate-save detection: saveList() skips writing a new snapshot when the
// current pairs are identical to the most recently saved list, so repeatedly
// printing the same list without editing it doesn't spam the history with
// identical entries.
export function pairsEqual(a: Pair[], b: Pair[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.front === b[i].front && p.back === b[i].back)
}
