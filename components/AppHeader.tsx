'use client'

import { createMemo } from '@barefootjs/client'
import { messages } from '../src/lib/i18n'
import type { Locale } from '../src/lib/i18n'

// The Popover API attributes (`popover`, `popovertarget`) are standard HTML
// but are not yet in @barefootjs/jsx's attribute types. Spreading them from a
// plain record keeps the JSX type-checking. These must be const object
// literals (not a function call) so the compiler folds them into both the
// SSR and client templates as static attributes; a function-call spread is
// left dynamic and drops out of the client template.
const popoverTarget: Record<string, string> = { popover: 'auto' }
const popoverTrigger: Record<string, string> = { popovertarget: 'sora-info' }
const howToTrigger: Record<string, string> = { popovertarget: 'sora-howto' }
const howToClose: Record<string, string> = { popovertarget: 'sora-howto', popovertargetaction: 'hide' }
// `loading` defers the YouTube embed until the modal actually opens (the
// popover is display:none until then); `allowfullscreen` is a bare boolean
// attribute not in @barefootjs/jsx's iframe types, same story as `popover`.
const howToIframeAttrs = { allowfullscreen: true, loading: 'lazy' } as const

// Shared by the circular icon buttons at the header's right edge and the
// how-to modal's close button.
const iconButton =
  'ml-1.5 w-6 h-6 p-0 inline-flex items-center justify-center text-xs font-semibold leading-none text-ink-3 bg-transparent border border-hairline rounded-full cursor-pointer transition-colors duration-150 hover:text-ink hover:border-[#ccc] focus-visible:outline-none focus-visible:border-brand'
// Module-scope template literal (evaluated once at load) so the JSX side
// stays a plain identifier — a template-literal className with interpolation
// inside JSX isn't reactive in BarefootJS's compiler, and a plain string
// constant sidesteps the question entirely.
const howToCloseButton = `${iconButton} absolute top-4 right-4 ml-0`

// Every direct child of .info-popover is a <p> (see app.css's former
// `.info-popover p` rule) — same vertical rhythm on all of them.
const infoP = 'm-0 mb-2.5 last:mb-0'
const infoPMuted = `${infoP} text-[#888]`
const infoLink = 'text-[#111] underline underline-offset-2'

interface AppHeaderProps {
  locale: string
  setLocale: (locale: Locale) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  onClearAllLists: () => void
}

export function AppHeader(props: AppHeaderProps) {
  const t = createMemo(() => messages[(props.locale as Locale) ?? 'ja'])

  return (
    <>
      <header className="no-print flex items-center gap-2.5">
        {/* Mobile-only reopen button (see app.css): on narrow layouts the
            sidebar is an overlay drawer, so the toggle lives in the header
            row instead of the workspace's left column. Same behavior as
            the .sidebar-open--inline button in ListSidebar.tsx — only one
            of the two is ever visible, switched by the 720px media query
            (still CSS: it's the one selector below that's genuinely about
            layout structure, not a single element's own look). */}
        {!props.sidebarOpen ? (
          <button
            type="button"
            className="sidebar-open--header flex-shrink-0 w-6 h-6 p-0 inline-flex items-center justify-center text-sm leading-none text-ink-3 bg-transparent border border-hairline rounded-md cursor-pointer transition-colors duration-150 hover:text-ink hover:border-[#ccc] focus-visible:outline-none focus-visible:border-brand"
            aria-expanded={props.sidebarOpen}
            aria-controls="list-sidebar"
            aria-label={t().sidebarToggleLabel}
            onClick={() => props.setSidebarOpen(true)}
          >
            <span className="sidebar-toggle-icon sidebar-toggle-icon--expand" aria-hidden="true" />
          </button>
        ) : null}
        {/* While the sidebar is closed the header shows only the toggle
            button (plus the right-aligned lang/info/help controls) — the
            "Sora" wordmark and tagline drop at any screen width, since the
            name already lives in the info popover. */}
        <h1 className={props.sidebarOpen ? 'm-0 inline-flex items-center gap-1.5 text-base font-[450]' : 'hidden'}>
          <img className="block flex-shrink-0 h-[18px] w-auto" src="/piconic-logo.svg" alt="piconic" width="390" height="104" />
          {/* Measured against the logo's glyph geometry (see docs/og.html):
              the wordmark's x-height body renders 0.123em below the logo's,
              so lift it by the same amount. em-based so it holds at any
              size. */}
          <span className="font-medium tracking-[0.01em] text-[rgba(31,35,40,0.55)] translate-y-[-0.123em]">sora</span>
        </h1>
        <select
          className="ml-auto h-6 px-1.5 py-0 text-xs font-[inherit] text-ink-3 bg-transparent border border-hairline rounded-md cursor-pointer transition-colors duration-150 hover:text-ink hover:border-[#ccc] focus:outline-none focus:border-brand"
          aria-label="Language"
          value={props.locale}
          onChange={(e) => props.setLocale((e.target as HTMLSelectElement).value as Locale)}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
        <button type="button" className={iconButton} aria-label={t().infoLabel} {...popoverTrigger}>
          <span aria-hidden="true">i</span>
        </button>
        <button type="button" className={iconButton} aria-label={t().howTo} {...howToTrigger}>
          <span aria-hidden="true">?</span>
        </button>
      </header>
      {/* Always-visible, one-line description of what Sora makes — the
          functional counterpart to the wordmark, so a first-time visitor
          (whose table is pre-seeded with the sample, hiding EditorMain's
          empty hint) still learns what the tool does. The trailing link is
          the in-context entry to the full how-to page. Lives here in the
          header island (not App) deliberately: App is WordTable's DOM
          ancestor, and adding reactive elements to App ahead of the
          workspace shifts its compiler-assigned `bf` ids — one collided
          with WordTable's front-input id and broke that island's event
          delegation (which resolves handlers via an unscoped
          `closest('[bf="s7"]')`). AppHeader is a sibling island, so its ids
          can never collide with WordTable's. */}
      <p className="lead no-print m-0 text-[13px] leading-[1.6] text-ink-2">
        {t().lead}{' '}
        <button
          type="button"
          className="whitespace-nowrap p-0 bg-transparent border-0 cursor-pointer font-[inherit] text-[13px] leading-[1.6] text-ink underline decoration-hairline underline-offset-2 hover:decoration-brand hover:text-brand"
          {...howToTrigger}
        >
          {t().howToLink} →
        </button>
      </p>
      <div
        id="sora-info"
        role="note"
        aria-label={t().infoLabel}
        className="no-print fixed top-16 right-6 bottom-auto left-auto m-0 py-5 px-[22px] w-[min(320px,calc(100vw-48px))] border border-[#f0f0f0] rounded-xl bg-white text-[#333] text-[13px] leading-[1.7] shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
        {...popoverTarget}
      >
        <p className={infoP}>
          <strong>Sora</strong>
          {t().infoLead}
        </p>
        <p className={infoP}>{t().infoNote}</p>
        <p className={infoPMuted}>{t().infoPrivacyNote}</p>
        <button
          type="button"
          className="w-full mt-1 mb-2.5 p-2 text-xs font-[inherit] text-[#b23a2e] bg-transparent border border-[#f0d9d6] rounded-md cursor-pointer hover:bg-[#fdf2f1]"
          onClick={() => props.onClearAllLists()}
        >
          {t().clearAllLists}
        </button>
        <p className={infoP}>
          {props.locale === 'ja' ? (
            <span>
              <a href="https://hono.dev" target="_blank" rel="noopener" className={infoLink}>Hono</a>
              {' と '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener" className={infoLink}>Barefoot.js</a>
              {' で構築。'}
            </span>
          ) : (
            <span>
              {'Built with '}
              <a href="https://hono.dev" target="_blank" rel="noopener" className={infoLink}>Hono</a>
              {' and '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener" className={infoLink}>Barefoot.js</a>
              {'.'}
            </span>
          )}
        </p>
        <p className={infoP}>
          <a href="https://github.com/piconic-ai/sora" target="_blank" rel="noopener" className={infoLink}>
            {t().viewSource}
          </a>
        </p>
        <hr className="my-3.5 border-0 border-t border-t-[#eee]" />
        <p className={infoP}>
          {t().infoContactIntro}
          <span className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            <a href="https://x.com/kfly8" target="_blank" rel="noopener" className={infoLink}>x.com/kfly8</a>
            <a href="mailto:kentafly88@gmail.com" className={infoLink}>kentafly88@gmail.com</a>
          </span>
        </p>
      </div>
      {/* How-to modal — the former standalone /how-to page, inlined so the
          steps are part of the top page's server-rendered HTML (they count
          toward what search engines index even while display:none). Popover
          API like #sora-info above: light dismiss + Esc for free, no JS.
          The scrim lives in app.css (#sora-howto::backdrop). */}
      <div
        id="sora-howto"
        role="dialog"
        aria-label={t().howTo}
        className="no-print fixed inset-0 m-auto py-6 px-7 w-[min(560px,calc(100vw-48px))] max-h-[min(80vh,640px)] overflow-y-auto box-border border border-[#f0f0f0] rounded-xl bg-white text-[#333] text-[15px] leading-[1.7] shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
        {...popoverTarget}
      >
        <button type="button" className={howToCloseButton} aria-label={t().closeLabel} {...howToClose}>
          <span aria-hidden="true">×</span>
        </button>
        <h2 className="text-xl font-semibold m-0 mb-4 text-[#111]">{t().howTo}</h2>
        {/* No `allow` attribute (YouTube's stock embed list): every feature
            name in it draws console warnings in Chrome or Firefox, and the
            multi-tab regression test (83) asserts a warning-free console.
            A click-to-play tutorial needs none of them — fullscreen comes
            from `allowfullscreen`. */}
        <iframe
          className="block w-full aspect-video border-0 outline outline-1 outline-[#eee] mb-6"
          src="https://www.youtube-nocookie.com/embed/WBR2XpbVRKk"
          title={t().howTo}
          {...howToIframeAttrs}
        />
        <ol className="m-0 pl-[22px] text-[15px] leading-[1.7] text-[#333] list-decimal">
          <li>{t().howToStep1}</li>
          <li className="mt-2.5">{t().howToStep2}</li>
          <li className="mt-2.5">{t().howToStep3}</li>
          <li className="mt-2.5">{t().howToStep4}</li>
          <li className="mt-2.5">{t().howToStep5}</li>
        </ol>
      </div>
    </>
  )
}
