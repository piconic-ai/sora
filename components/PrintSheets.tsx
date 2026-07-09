'use client'

import { createEffect } from '@barefootjs/client'
import type { LayoutResult, PageLayout, Settings } from '../src/lib/types'
import { A4 } from '../src/lib/constants'
import { fitFontSizePt } from '../src/lib/fit'

interface PrintSheetsProps {
  layout: LayoutResult
  settings: Settings
}

const TICK_MM = 2

// Sheets are rendered by hand-building an HTML string and assigning it via
// innerHTML (in the createEffect below) rather than through BarefootJS's
// JSX/list-rendering system. BarefootJS's keyed-list diffing (mapArray)
// does not propagate prop updates into a nested child component embedded
// in a loop, and a plain helper function returning JSX loses its closure
// over local variables once compiled — both were tried and produced
// blank/broken sheets on re-render. Sheets have no event handlers, so a
// plain string-render + innerHTML swap is safe and sidesteps both issues.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderSheetHtml(page: PageLayout, settings: Settings, pageNumber: number, totalPages: number): string {
  const bands = settings.bands
  const panelH = settings.panelHeightMm
  const panelsPerBand = page.bands[0]?.panels.length ?? 0

  const usableX0 = settings.marginMm
  const usableX1 = A4.widthMm - settings.marginMm
  const usableY0 = settings.marginMm
  const usableY1 = A4.heightMm - settings.marginMm
  const bandWidth = (usableX1 - usableX0) / bands

  const foldRows = Array.from({ length: panelsPerBand - 1 }, (_, i) => usableY0 + (i + 1) * panelH)
  const cutBands = Array.from({ length: bands - 1 }, (_, i) => usableX0 + (i + 1) * bandWidth)

  const bandsHtml = page.bands
    .map(
      (band) =>
        `<div class="band">${band.panels
          .map((panel) => {
            const fitted = panel.text
              ? fitFontSizePt(panel.text, bandWidth, settings.fontSizePt)
              : settings.fontSizePt
            const style = fitted !== settings.fontSizePt ? ` style="font-size:${fitted}pt"` : ''
            const cls = panel.kind === 'empty' ? 'panel empty' : 'panel'
            return `<div class="${cls}"${style}>${escapeHtml(panel.text)}</div>`
          })
          .join('')}</div>`,
    )
    .join('')

  // The sheet is accordion-folded across its full width BEFORE being cut
  // into strips, so fold guides are only needed at the paper's outer
  // edges — a ruler spans the two. No marks at interior band boundaries.
  const foldTicksHtml = foldRows
    .map(
      (y) =>
        `<line x1="${usableX0}" y1="${y}" x2="${usableX0 + TICK_MM}" y2="${y}" class="fold" />` +
        `<line x1="${usableX1 - TICK_MM}" y1="${y}" x2="${usableX1}" y2="${y}" class="fold" />`,
    )
    .join('')

  const cutTicksHtml = cutBands
    .map(
      (x) =>
        `<line x1="${x}" y1="${usableY0}" x2="${x}" y2="${usableY0 + TICK_MM}" />` +
        `<line x1="${x}" y1="${usableY1 - TICK_MM}" x2="${x}" y2="${usableY1}" />`,
    )
    .join('')

  return `<div class="sheet" style="--bands:${bands}; --panel-h:${panelH}mm; --font-pt:${settings.fontSizePt}pt; --sheet-margin:${settings.marginMm}mm;">
    <div class="bands">${bandsHtml}</div>
    <svg class="marks" viewBox="0 0 ${A4.widthMm} ${A4.heightMm}" preserveAspectRatio="none">${foldTicksHtml}${cutTicksHtml}</svg>
    <div class="page-no">P. ${pageNumber} / ${totalPages}</div>
  </div>`
}

function renderPagesHtml(layout: LayoutResult, settings: Settings): string {
  if (layout.pages.length === 0) return ''
  return layout.pages.map((page, i) => renderSheetHtml(page, settings, i + 1, layout.totalPages)).join('')
}

export function PrintSheets(props: PrintSheetsProps) {
  const measure = (el: HTMLElement) => {
    createEffect(() => {
      el.innerHTML = renderPagesHtml(props.layout, props.settings)
    })
  }

  return <div className="print-sheets" ref={measure} />
}
