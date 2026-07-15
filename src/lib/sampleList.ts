import type { Pair } from './types'

// The sample seeded when saved history is empty (see App.tsx's initialize /
// handleClearAllLists), so a first visit opens onto a working example rather
// than a blank table.
//
// Kept at exactly 28 pairs — one full A4 sheet at the default 4×7 layout
// (computeCapacity) — so a first print comes out complete; don't add a 29th
// without spilling onto a second page. `back` is "Japanese - romaji" in
// double-vowel Hepburn (Ohayou, not Ohayō) to match the app's other copy.
export const SAMPLE_TITLE = 'Japan Travel Phrases'

export const SAMPLE_PAIRS: Pair[] = [
  { front: 'Hello', back: 'こんにちは - Konnichiwa' },
  { front: 'Good morning', back: 'おはよう - Ohayou' },
  { front: 'Good evening', back: 'こんばんは - Konbanwa' },
  { front: 'Nice to meet you', back: 'はじめまして - Hajimemashite' },
  { front: 'Thank you', back: 'ありがとう - Arigatou' },
  { front: "You're welcome", back: 'どういたしまして - Douitashimashite' },
  { front: 'Excuse me', back: 'すみません - Sumimasen' },
  { front: "I'm sorry", back: 'ごめんなさい - Gomennasai' },
  { front: 'Please', back: 'お願いします - Onegaishimasu' },
  { front: 'Yes', back: 'はい - Hai' },
  { front: 'No', back: 'いいえ - Iie' },
  { front: 'Do you speak English?', back: '英語を話せますか - Eigo o hanasemasu ka' },
  { front: "I don't understand", back: 'わかりません - Wakarimasen' },
  { front: 'How much is it?', back: 'いくらですか - Ikura desu ka' },
  { front: 'This one, please', back: 'これをください - Kore o kudasai' },
  { front: 'Where is it?', back: 'どこですか - Doko desu ka' },
  { front: 'Station', back: '駅 - Eki' },
  { front: 'Water', back: '水 - Mizu' },
  { front: 'Delicious', back: 'おいしい - Oishii' },
  { front: 'Before a meal', back: 'いただきます - Itadakimasu' },
  { front: 'After a meal', back: 'ごちそうさま - Gochisousama' },
  { front: 'Cheers!', back: '乾杯 - Kanpai' },
  { front: 'Beautiful', back: '美しい - Utsukushii' },
  { front: 'Cute', back: 'かわいい - Kawaii' },
  { front: 'Amazing', back: 'すごい - Sugoi' },
  { front: "It's OK", back: 'だいじょうぶ - Daijoubu' },
  { front: 'Goodbye', back: 'さようなら - Sayounara' },
  { front: 'Take care', back: 'お元気で - Ogenki de' },
]
