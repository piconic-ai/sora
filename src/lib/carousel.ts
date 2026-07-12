// Pure helpers for the history carousel (components/App.tsx). Kept
// dependency-free of signals/DOM/IndexedDB so the index arithmetic and URL
// parsing that drive paging can be unit-tested without a browser or storage
// mocks — the stateful wiring (lists signal, IndexedDB calls, location/
// history) stays in App.tsx.

// Parses the list id out of a `/l/{id}` pathname, or null for anything else
// (including a bare `/l/` with no id, and the root `/`). A trailing slash
// after the id is tolerated. The id is decoded so a URL-encoded id round-
// trips, matching buildListPath's encodeURIComponent.
export function parseListIdFromPath(pathname: string): string | null {
  const match = /^\/l\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    // Malformed percent-encoding (e.g. a lone `%`) — treat as no id rather
    // than throwing, consistent with "unknown id falls back to default".
    return null
  }
}

// The inverse of parseListIdFromPath: the path to open a given list at.
export function buildListPath(id: string): string {
  return `/l/${encodeURIComponent(id)}`
}

// After removing the element at `removedIndex` from an array, adjusts a
// `targetIndex` that was computed against the array *before* the removal so
// it still refers to the same logical element afterward. Only indices after
// the removed one shift (by one, toward zero); an index at or before it is
// unaffected.
export function adjustIndexAfterRemoval(removedIndex: number, targetIndex: number): number {
  return removedIndex < targetIndex ? targetIndex - 1 : targetIndex
}

// Whether creating one more list would push the saved count past `max`,
// meaning the caller must confirm with the user before evicting the oldest
// entry rather than silently discarding it.
export function shouldConfirmBeforeNewList(count: number, max: number): boolean {
  return count >= max
}
