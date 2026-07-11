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
