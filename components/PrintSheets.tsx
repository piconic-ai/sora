'use client'

import { createEffect } from '@barefootjs/client'
import type { LayoutResult, PageLayout, Settings } from '../src/lib/types'
import { A4 } from '../src/lib/constants'
import { computeSheetGeometry } from '../src/lib/sheetGeometry'
import { fitFontSizePt } from '../src/lib/fit'

interface PrintSheetsProps {
  layout: LayoutResult
  settings: Settings
}

const TICK_MM = 2

// Sheets are rendered by hand-building an HTML string and assigning it via
// innerHTML (in the createEffect below) rather than through BarefootJS's
// JSX list-rendering system.
//
// The two bugs that originally forced this (piconic-ai/barefootjs#2218,
// nested-`.map()` index ReferenceError; #2219, SVG inner-loop wrong
// namespace) were both fixed in @barefootjs 0.18.7 — verified here: the JSX
// version's SVG `<line>` ticks render in the correct namespace and the
// depth-2 pages>bands>panels grid renders on first paint. But converting is
// still blocked by a further, distinct compiler bug:
//
//   - piconic-ai/barefootjs#2264 — at nesting depth 2 (pages > bands >
//     panels), a reactive *text child* of the innermost element gets no
//     update effect (its attrs do), so an edited panel keeps showing the old
//     word. Verified in the compiled client JS: zero textContent effects are
//     emitted for the panel text at that depth, vs one for an equivalent
//     single-level loop.
//
// So the innerHTML approach stays until #2264 lands (at which point this
// becomes a straightforward nested-`.map()` over a view-model — see the
// design in #2264). It reuses `computeSheetGeometry` (a pure, unit-tested
// function in ../src/lib/sheetGeometry.ts) so the geometry math is shared and
// tested; only the DOM-construction step here is manual.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderSheetHtml(page: PageLayout, settings: Settings): string {
  const panelsPerBand = page.bands[0]?.panels.length ?? 0
  const geo = computeSheetGeometry(settings, panelsPerBand)
  const { usableX0, usableX1, usableY0, usableY1, bandWidth, gridTop, foldRows, cutBands } = geo

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

  return `<div class="sheet" style="--bands:${settings.bands}; --panel-h:${settings.panelHeightMm}mm; --font-pt:${settings.fontSizePt}pt; --sheet-margin:${settings.marginMm}mm; --grid-top:${gridTop}mm;">
    <div class="bands">${bandsHtml}</div>
    <svg class="marks" viewBox="0 0 ${A4.widthMm} ${A4.heightMm}" preserveAspectRatio="none">${foldTicksHtml}${cutTicksHtml}</svg>
  </div>`
}

function renderPagesHtml(layout: LayoutResult, settings: Settings): string {
  if (layout.pages.length === 0) return ''
  return layout.pages.map((page) => renderSheetHtml(page, settings)).join('')
}

export function PrintSheets(props: PrintSheetsProps) {
  const measure = (el: HTMLElement) => {
    createEffect(() => {
      el.innerHTML = renderPagesHtml(props.layout, props.settings)
    })
  }

  return <div className="print-sheets" ref={measure} />
}
