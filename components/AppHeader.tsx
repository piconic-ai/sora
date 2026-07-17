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
      <header className={props.sidebarOpen ? 'app-header no-print' : 'app-header no-print logo-hidden'}>
        {/* Mobile-only reopen button (see app.css): on narrow layouts the
            sidebar is an overlay drawer, so the toggle lives in the header
            row instead of the workspace's left column. Same behavior as
            the .sidebar-open--inline button in App.tsx — only one of the
            two is ever visible, switched by the 720px media query. */}
        {!props.sidebarOpen ? (
          <button
            type="button"
            className="sidebar-open sidebar-open--header"
            aria-expanded={props.sidebarOpen}
            aria-controls="list-sidebar"
            aria-label={t().sidebarToggleLabel}
            onClick={() => props.setSidebarOpen(true)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
        ) : null}
        <h1 className="app-title">
          <img className="app-logo" src="/piconic-logo.svg" alt="piconic" width="390" height="104" />
          <span className="app-wordmark">sora</span>
        </h1>
        <p className="app-tagline">{t().tagline}</p>
        <select
          className="lang-select"
          aria-label="Language"
          value={props.locale}
          onChange={(e) => props.setLocale((e.target as HTMLSelectElement).value as Locale)}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
        <button type="button" className="info-button" aria-label={t().infoLabel} {...popoverTrigger}>
          <span aria-hidden="true">i</span>
        </button>
        <a href="/how-to" className="help-button" aria-label={t().howTo}>
          <span aria-hidden="true">?</span>
        </a>
      </header>
      <div id="sora-info" role="note" aria-label={t().infoLabel} className="info-popover no-print" {...popoverTarget}>
        <p className="info-lead">
          <strong>Sora</strong>
          {t().infoLead}
        </p>
        <p className="info-note">{t().infoNote}</p>
        <p className="info-privacy">{t().infoPrivacyNote}</p>
        <button type="button" className="info-clear-all" onClick={() => props.onClearAllLists()}>
          {t().clearAllLists}
        </button>
        <p className="info-built">
          {props.locale === 'ja' ? (
            <span>
              <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
              {' と '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener">Barefoot.js</a>
              {' で構築。'}
            </span>
          ) : (
            <span>
              {'Built with '}
              <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
              {' and '}
              <a href="https://github.com/piconic-ai/barefootjs" target="_blank" rel="noopener">Barefoot.js</a>
              {'.'}
            </span>
          )}
        </p>
        <p className="info-source">
          <a href="https://github.com/piconic-ai/sora" target="_blank" rel="noopener">
            {t().viewSource}
          </a>
        </p>
        <hr />
        <p className="info-contact">
          {t().infoContactIntro}
          <span className="info-contact-links">
            <a href="https://x.com/kfly8" target="_blank" rel="noopener">x.com/kfly8</a>
            <a href="mailto:kentafly88@gmail.com">kentafly88@gmail.com</a>
          </span>
        </p>
      </div>
    </>
  )
}
