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
  if (typeof d.updatedAt !== 'number' || !Number.isFinite(d.updatedAt)) return null

  return { v: DRAFT_VERSION, pairs: normalizePairs(d.pairs as Pair[]), updatedAt: d.updatedAt }
}

// A saved history entry — a document-mode word list. It has an `id` (the IDB
// keyPath for the 'lists' store) and an optional user-set `title`. When
// `title` is absent, the display label is derived on the fly from `pairs` +
// `createdAt` (see i18n.ts's displayListTitle / historyItemTitle) so a locale
// switch immediately relabels every untitled entry; a custom `title` is shown
// verbatim and is therefore locale-independent.
export const LIST_VERSION = 1

export interface SavedList {
  v: 1
  id: string
  pairs: Pair[]
  createdAt: number
  updatedAt: number
  // Optional user-set custom name. Adding this is backward-compatible (no
  // LIST_VERSION bump): pre-title records simply have no `title` key, and
  // deserializeList treats a missing/blank/non-string value as undefined.
  title?: string
}

// The single place raw title text is turned into a stored value: trim, and
// treat an all-whitespace result as "no title" (undefined). Used by both the
// write path (serializeList / renameList) and App's inline-rename commit so
// clearing the field always falls back to the auto-generated label.
export function normalizeTitle(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

// `title` is optional and normalized on the way in — an undefined or
// all-whitespace title is omitted entirely (no `title` key) so an untitled
// list serializes exactly as it did before this field existed.
export function serializeList(
  id: string,
  pairs: Pair[],
  createdAt: number,
  updatedAt: number,
  title?: string,
): SavedList {
  const entry: SavedList = { v: LIST_VERSION, id, pairs: normalizePairs(pairs), createdAt, updatedAt }
  const normalized = title === undefined ? undefined : normalizeTitle(title)
  if (normalized !== undefined) entry.title = normalized
  return entry
}

// Same discard-rather-than-throw contract as deserializeDraft: a version
// mismatch or malformed shape (hand-edited/corrupted IndexedDB content)
// returns null so listSaved() can silently drop unreadable entries instead
// of crashing the whole history popover.
//
// `updatedAt` is validated the same way as `createdAt`, but missing/invalid
// values fall back to `createdAt` rather than rejecting the whole entry —
// this keeps pre-"document mode" lists (saved before updatedAt existed)
// readable after the upgrade instead of silently vanishing from history.
export function deserializeList(raw: unknown): SavedList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>

  if (d.v !== LIST_VERSION) return null
  if (typeof d.id !== 'string' || d.id === '') return null
  if (!Array.isArray(d.pairs)) return null
  if (!d.pairs.every(isPair)) return null
  if (typeof d.createdAt !== 'number' || !Number.isFinite(d.createdAt)) return null

  const updatedAt =
    typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : d.createdAt

  const entry: SavedList = {
    v: LIST_VERSION,
    id: d.id,
    pairs: normalizePairs(d.pairs as Pair[]),
    createdAt: d.createdAt,
    updatedAt,
  }
  // Backward-compatible + defensive: keep a stored title only when it's a
  // non-blank string. Missing (pre-title records), non-string, or whitespace-
  // only values all collapse to "no title" so display falls back to the
  // auto-generated label.
  if (typeof d.title === 'string' && d.title.trim() !== '') entry.title = d.title
  return entry
}

// Redundant-write detection: updateList() skips writing when the incoming
// pairs are identical to what's already stored, so autosave can fire on every
// keystroke without churning IndexedDB with no-op writes.
export function pairsEqual(a: Pair[], b: Pair[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.front === b[i].front && p.back === b[i].back)
}
