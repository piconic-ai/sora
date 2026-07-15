import type { Pair } from './types'

// Seeded into history (see App.tsx's initialize/handleClearAllLists) whenever
// there is zero saved history, so a first-time visitor — or someone who just
// cleared everything — has a working example to open, edit, or print instead
// of a blank table. `front` is English, `back` is "Japanese - romaji", the
// same back-field shape (meaning + a short gloss after a dash) already used
// throughout the app's own example content.
export const SAMPLE_TITLE = 'Sample'

export const SAMPLE_PAIRS: Pair[] = [
  { front: 'Hello', back: 'こんにちは - Konnichiwa' },
  { front: 'Good bye', back: 'さようなら - Sayounara' },
  { front: 'Thank you', back: 'ありがとう - Arigatou' },
  { front: 'Yes', back: 'はい - Hai' },
  { front: 'No', back: 'いいえ - Iie' },
  { front: 'Please', back: 'お願いします - Onegaishimasu' },
  { front: 'Sorry', back: 'ごめんなさい - Gomennasai' },
  { front: 'Good morning', back: 'おはよう - Ohayou' },
]
