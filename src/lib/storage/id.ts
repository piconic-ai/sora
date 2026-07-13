// Dependency-free, URL-path-safe id generator — equivalent to nanoid's
// default output (21 chars from a 64-symbol alphabet) without pulling in the
// package, since the whole need is "a short A-Za-z0-9_- id usable in a
// `/l/{id}` URL", not nanoid's broader API.
//
// The alphabet is nanoid's `urlAlphabet`: exactly 64 URL-safe symbols, so
// `byte & 63` maps every random byte uniformly onto one symbol — no rejection
// sampling or modulo bias to worry about.
const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

// `crypto.getRandomValues` is the CSPRNG path (available in browsers and
// Workers). If it's somehow unavailable — an extreme/misconfigured
// environment — fall back to `Math.random()` so id generation never throws,
// matching db.ts's fail-soft policy of never letting storage plumbing crash
// the app. The fallback is non-cryptographic but still collision-resistant
// enough for a per-device history list.
export function generateId(size = 21): string {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(size))
    let id = ''
    for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] & 63]
    return id
  } catch {
    let id = ''
    for (let i = 0; i < size; i++) id += ALPHABET[Math.floor(Math.random() * 64)]
    return id
  }
}
