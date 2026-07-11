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
  madeBy: string
  howTo: string
}

export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return 'en'
  return /\bja\b/i.test(acceptLanguage) ? 'ja' : 'en'
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
    madeBy: 'piconic がつくりました',
    howTo: '作り方',
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
    madeBy: 'Made by piconic',
    howTo: 'How to make it',
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
