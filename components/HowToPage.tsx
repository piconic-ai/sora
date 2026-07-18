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
    <div className="max-w-[640px] mx-auto pt-14 px-6 pb-24 box-border [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,'Hiragino_Kaku_Gothic_ProN','Yu_Gothic_Medium',Meiryo,sans-serif] text-[15px] text-[#111]">
      <a
        href="/"
        className="inline-block mb-5 text-[13px] text-[#888] no-underline hover:text-[#111]"
        aria-label={t.howToBackLabel}
      >
        ← Sora
      </a>
      <h1 className="text-xl font-semibold m-0 mb-4">{t.howTo}</h1>
      <iframe
        className="block w-full aspect-video border-0 outline outline-1 outline-[#eee] mb-6"
        src="https://www.youtube-nocookie.com/embed/WBR2XpbVRKk"
        title={t.howTo}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        loading="lazy"
      />
      <ol className="m-0 pl-[22px] text-[15px] leading-[1.7] text-[#333] list-decimal">
        <li>{t.howToStep1}</li>
        <li className="mt-2.5">{t.howToStep2}</li>
        <li className="mt-2.5">{t.howToStep3}</li>
        <li className="mt-2.5">{t.howToStep4}</li>
        <li className="mt-2.5">{t.howToStep5}</li>
      </ol>
    </div>
  )
}
