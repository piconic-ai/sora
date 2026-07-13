import { messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'

interface HowToPageProps {
  locale: string
}

// The standalone `/how-to` page (server.tsx's renderHowTo). Deliberately NOT
// 'use client' — it has no signals, no event handlers, nothing to hydrate.
// It's a plain server-rendered JSX function, so it never appears in
// public/components/manifest.json and ships zero client JS of its own.
export function HowToPage(props: HowToPageProps) {
  const locale: Locale = props.locale === 'en' ? 'en' : 'ja'
  const t = messages[locale]

  return (
    <div className="howto-page">
      <a href="/" className="howto-back" aria-label={t.howToBackLabel}>
        ← Sora
      </a>
      <h1>{t.howTo}</h1>
      <ol className="howto-steps">
        <li>{t.howToStep1}</li>
        <li>{t.howToStep2}</li>
        <li>{t.howToStep3}</li>
      </ol>
      <video className="howto-video" src="/howto.webm" controls muted loop />
    </div>
  )
}
