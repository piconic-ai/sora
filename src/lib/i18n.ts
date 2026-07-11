import type { PageFill } from './pageMeter'

export type Locale = 'ja' | 'en'

export interface Messages {
  title: string
  tagline: string
  metaDescription: string
  front: string
  back: string
  print: string
  hint: string
  pasteError: string
  howTo: string
  // Info popover (FB5) — the "Sora" bit of the lead sentence is hard-coded
  // as <strong>Sora</strong> in App.tsx, so infoLead is just the remainder
  // of that sentence. The "Built with …" and contact-link lines differ in
  // word order between ja/en, so those are branched in JSX instead of
  // being modeled as messages here.
  infoLabel: string
  infoLead: string
  infoNote: string
  infoContactIntro: string
}

export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return 'en'
  return /\bja\b/i.test(acceptLanguage) ? 'ja' : 'en'
}

// Resolves the locale to render for a request: a previously-set `locale`
// cookie wins (so a manual language switch persists across reloads), and
// falls back to Accept-Language sniffing (pickLocale) for first-time
// visitors with no cookie yet.
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (cookieValue === 'ja' || cookieValue === 'en') return cookieValue
  return pickLocale(acceptLanguage)
}

export const messages: Record<Locale, Messages> = {
  ja: {
    title: 'Sora — そらで覚える',
    tagline: 'そらで覚える',
    metaDescription:
      '単語（表面）と訳（裏面）を入力するだけで、切って蛇腹に折る単語帳の印刷レイアウトを作れます。ログイン不要・保存不要。',
    front: '表面',
    back: '裏面',
    print: '印刷',
    hint: '表面と裏面を入力すると、切って折るだけの単語帳になります。',
    pasteError: '貼り付けた行数が奇数のため、ペアを作れませんでした',
    howTo: '作り方',
    infoLabel: 'Soraについて',
    infoLead: 'は、単語（表面）と訳（裏面）を入力するだけで、切って蛇腹に折る単語帳の印刷レイアウトをつくります。',
    infoNote: '「そら」は「そらで覚える（諳んじる）」から。',
    infoContactIntro: 'ご質問・ご感想は kobaken まで：',
  },
  en: {
    title: 'Sora — Learn by heart',
    tagline: 'Learn by heart',
    metaDescription: 'Type word pairs and print a fold-and-cut flashcard booklet. No login, nothing saved.',
    front: 'Front',
    back: 'Back',
    print: 'Print',
    hint: 'Enter fronts and backs to make a cut-and-fold flashcard booklet.',
    pasteError: "Odd number of lines — couldn't form pairs",
    howTo: 'How to make it',
    infoLabel: 'About Sora',
    infoLead: ' turns your word pairs into a print-and-fold accordion flashcard booklet.',
    infoNote: '"Sora" comes from the Japanese "そらで覚える" — to learn something by heart.',
    infoContactIntro: 'Questions or feedback? Reach out to kobaken:',
  },
}

// Caption for the page-capacity progress bar (FB4): communicates which page
// is currently being filled and how many words are still needed to fill it
// completely (28 pairs per page by default — see DEFAULTS/computeCapacity).
export function pageMeterCaption(locale: Locale, fill: PageFill): string {
  const { page, filled, capacity, isFull } = fill

  if (locale === 'ja') {
    if (isFull) return `${page}ページ目 ・ ${filled}/${capacity}語 ・ ちょうど1ページ分`
    return `${page}ページ目 ・ ${filled}/${capacity}語 ・ あと${capacity - filled}語で1ページ`
  }

  if (isFull) return `Page ${page} · ${filled}/${capacity} words · Fills the page exactly`
  const remaining = capacity - filled
  const wordLabel = remaining === 1 ? 'word' : 'words'
  return `Page ${page} · ${filled}/${capacity} words · ${remaining} more ${wordLabel} to fill the page`
}
