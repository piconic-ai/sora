import type { Pair } from './types'

// Seeded into history (see App.tsx's initialize/handleClearAllLists) whenever
// there is zero saved history, so a first-time visitor — or someone who just
// cleared everything — has a working example to open, edit, or print instead
// of a blank table.
//
// Content: the words and phrases an English speaker would actually want on a
// first trip to Japan — greetings, polite basics, a few travel questions, the
// dining expressions that are uniquely Japanese (いただきます / ごちそうさま /
// 乾杯), and a couple of aesthetic adjectives — chosen so the Japanese script
// itself (kanji where it reads beautifully) carries some of the language's
// charm. `front` is English; `back` is "Japanese - romaji" (double-vowel
// Hepburn, first word capitalized).
//
// Exactly 28 pairs — one full printed A4 sheet at the default layout
// (computeCapacity: 4 bands × 7 pairs) — so a first print comes out complete.
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
