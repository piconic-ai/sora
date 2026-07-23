import type { SavedList } from './storage/schema'
import type { Pair } from './types'

export type Locale = 'ja' | 'en'

export interface Messages {
  title: string
  metaDescription: string
  front: string
  back: string
  print: string
  // One-line, always-visible description of what Sora makes (header area).
  // The functional counterpart to the poetic wordmark — a first-time
  // visitor learns what the tool does without opening the info popover or
  // the how-to page. `lead` is the sentence; `howToLink` is the trailing
  // inline link to the /how-to page appended after it.
  lead: string
  howToLink: string
  // Persistent note under the print button: the one browser print setting
  // that ruins the layout if left on (page numbers/URL printed onto the
  // sheet). Shown to every user, every print — not a one-time tip.
  printTip: string
  hint: string
  pasteError: string
  // "作り方 / How to make it" — the standalone /how-to page's heading and
  // <title>, and doubles as the aria-label for the header's "?" link to
  // that page (components/HowToPage.tsx, components/App.tsx).
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
  // Privacy note appended to the info popover (history feature): clarifies
  // that saved lists never leave the device.
  infoPrivacyNote: string
  // Link text to the public source repo in the info popover.
  viewSource: string
  // Saved-list sidebar (autosaved, editable lists — see components/App.tsx).
  newList: string
  // aria-label for the sidebar's list region.
  listsLabel: string
  // aria-label for each list's delete button (inside the ⋮ menu).
  deleteThisList: string
  // "Rename" — the ⋮ menu's rename item, and the aria-label of the inline
  // rename input.
  renameListLabel: string
  // aria-label for each list's ⋮ (more-actions) menu button.
  listItemMenu: string
  // Shown via window.confirm before deleting a non-empty list — a list can
  // hold dozens of pairs and the delete is irreversible, so it needs explicit
  // confirmation.
  confirmDeleteThisList: string
  confirmClearAll: string
  // Shown via window.confirm when creating a new list would push the saved
  // count past the MAX_LISTS cap (src/lib/storage/lists.ts) — evicting the
  // oldest list needs explicit confirmation rather than doing it silently.
  confirmEvictOldest: string
  // "Clear all history" lives in the info popover (a shared-device privacy
  // control), not the sidebar itself.
  clearAllLists: string
  // aria-label for the header's sidebar open/close toggle button.
  sidebarToggleLabel: string
  // The five steps on the standalone /how-to page, matching the beats of
  // the how-to video embedded there (docs/DESIGN.md §2 is the reference
  // procedure). Deliberately paper-size-agnostic — no A4 wording.
  howToStep1: string
  howToStep2: string
  howToStep3: string
  howToStep4: string
  howToStep5: string
  // aria-label for the "← Sora" link back to the app from /how-to.
  howToBackLabel: string
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
    metaDescription:
      '単語（表面）と訳（裏面）を入力するだけで、切って蛇腹に折る単語帳の印刷レイアウトを作れます。ログイン不要・保存不要。',
    front: '表面',
    back: '裏面',
    print: '印刷',
    lead: '単語を入力して印刷。切って折るだけの、めくって覚える単語帳ができます。',
    howToLink: '作り方はこちら',
    printTip: '印刷設定の「ヘッダーとフッター」をオフにしてください。',
    hint: '表面と裏面を入力すると、切って折るだけの単語帳になります。',
    pasteError: '貼り付けた行数が奇数のため、ペアを作れませんでした',
    howTo: '作り方',
    infoLabel: 'Soraについて',
    infoLead: 'は、単語（表面）と訳（裏面）を入力するだけで、切って蛇腹に折る単語帳の印刷レイアウトをつくります。',
    infoNote: '「そら」は「そらで覚える（諳んじる）」から。',
    infoContactIntro: 'ご質問・ご感想は kobaken まで：',
    infoPrivacyNote: 'データはこの端末のブラウザ内にのみ保存されます。',
    viewSource: 'GitHubでソースを見る',
    newList: '新規作成',
    listsLabel: 'リスト一覧',
    deleteThisList: 'このリストを削除',
    renameListLabel: '名前を変更',
    listItemMenu: '項目メニュー',
    confirmDeleteThisList: 'このリストを削除しますか？',
    confirmClearAll: 'すべてのリストを削除しますか？この操作は取り消せません。',
    confirmEvictOldest: '保存できるリストは50件までです。最も古いリストを削除して新規作成しますか？',
    clearAllLists: '履歴をすべて削除',
    sidebarToggleLabel: 'サイドバーの開閉',
    howToStep1: '表面と裏面の単語ペアを入力します。',
    howToStep2: '用紙1枚に印刷します。',
    howToStep3: '横の折り線に沿って蛇腹（アコーディオン）に折ります。',
    howToStep4: '縦の線に沿って切り、細い帯に分けます。',
    howToStep5: 'めくって答えを確認 — そらでおぼえましょう。',
    howToBackLabel: 'Soraに戻る',
  },
  en: {
    title: 'Sora — Learn by heart',
    metaDescription: 'Type word pairs and print a fold-and-cut flashcard booklet. No login, nothing saved.',
    front: 'Front',
    back: 'Back',
    print: 'Print',
    lead: 'Type your words and print — cut and fold into a flip-through flashcard booklet.',
    howToLink: 'How to make it',
    printTip: 'Turn off “Headers and footers” in the print settings.',
    hint: 'Enter fronts and backs to make a cut-and-fold flashcard booklet.',
    pasteError: "Odd number of lines — couldn't form pairs",
    howTo: 'How to make it',
    infoLabel: 'About Sora',
    infoLead: ' turns your word pairs into a print-and-fold accordion flashcard booklet.',
    infoNote: '"Sora" comes from the Japanese "そらで覚える" — to learn something by heart.',
    infoContactIntro: 'Questions or feedback? Reach out to kobaken:',
    infoPrivacyNote: 'Your lists are saved only in this browser, on this device.',
    viewSource: 'View the source on GitHub',
    newList: 'New',
    listsLabel: 'Lists',
    deleteThisList: 'Delete this list',
    renameListLabel: 'Rename',
    listItemMenu: 'List actions',
    confirmDeleteThisList: 'Delete this list?',
    confirmClearAll: 'Delete every list? This cannot be undone.',
    confirmEvictOldest: 'You can only keep 50 lists. Delete the oldest one and create a new list?',
    clearAllLists: 'Clear all history',
    sidebarToggleLabel: 'Toggle list sidebar',
    howToStep1: 'Type word pairs — front and back',
    howToStep2: 'Print on a single sheet',
    howToStep3: 'Accordion-fold along the horizontal lines',
    howToStep4: 'Cut along the vertical lines into strips',
    howToStep5: 'Flip to check the answer — learn by heart',
    howToBackLabel: 'Back to Sora',
  },
}

// Auto-generated display title for a history entry: saved lists carry no
// title of their own (see schema.ts's SavedList), so the label is derived
// every time from the first pair's front + word count + save date. Locale-
// dependent so a language switch immediately relabels every history item.
// ja: "Apple ほか12語 · 7/11"  en: "Apple +11 · 7/11"
export function historyItemTitle(locale: Locale, pairs: Pair[], createdAt: number): string {
  const date = new Date(createdAt)
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`

  if (pairs.length === 0) {
    return locale === 'ja' ? `空のリスト · ${dateLabel}` : `Empty list · ${dateLabel}`
  }

  const front = pairs[0].front.trim()
  const label = front === '' ? (locale === 'ja' ? '(無題)' : '(untitled)') : front
  const rest = pairs.length - 1

  if (rest === 0) return `${label} · ${dateLabel}`
  return locale === 'ja' ? `${label} ほか${rest}語 · ${dateLabel}` : `${label} +${rest} · ${dateLabel}`
}

// The label shown for a saved list in the sidebar: a user-set custom `title`
// wins (verbatim, so it's locale-independent), otherwise it falls back to the
// locale-dependent auto-generated label. Centralizes the "title ?? auto" rule
// so every display site (and its locale behavior) stays consistent.
export function displayListTitle(locale: Locale, list: SavedList): string {
  return list.title ?? historyItemTitle(locale, list.pairs, list.createdAt)
}
