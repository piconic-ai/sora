export type Locale = 'ja' | 'en'

export interface Messages {
  title: string
  tagline: string
  metaDescription: string
  front: string
  back: string
  addRow: string
  deleteRow: string
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
    addRow: '+ 行を追加',
    deleteRow: '行を削除',
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
    addRow: '+ Add row',
    deleteRow: 'Delete row',
    print: 'Print',
    hint: 'Enter fronts and backs to make a cut-and-fold flashcard booklet.',
    pasteError: "Odd number of lines — couldn't form pairs",
    madeBy: 'Made by piconic',
    howTo: 'How to make it',
  },
}

export function summary(locale: Locale, words: number, pages: number): string {
  if (locale === 'ja') return `${words}語 ・ ${pages}ページ`
  const wordLabel = words === 1 ? 'word' : 'words'
  const pageLabel = pages === 1 ? 'page' : 'pages'
  return `${words} ${wordLabel} · ${pages} ${pageLabel}`
}
