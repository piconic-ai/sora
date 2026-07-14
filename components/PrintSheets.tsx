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

// Fold-guide dot radius. 0.4mm prints as a subtle ~0.8mm dot — visible
// while folding, unobtrusive on the finished card.
const DOT_R_MM = 0.4

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
  const { bandWidth, gridTop, foldRows, cutBands } = geo

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

  // The only printed marks: a dot at every fold-row × cut-line
  // intersection. The dot columns show where to cut the sheet into strips,
  // and cutting slices each dot in half, leaving a mark on both strips'
  // edges at every fold position — each strip carries its own fold guides,
  // no ruler needed. (No marks at the paper edges: printers often clip
  // them, depending on the printable-area settings.)
  const foldDotsHtml = cutBands
    .map((x) => foldRows.map((y) => `<circle cx="${x}" cy="${y}" r="${DOT_R_MM}" />`).join(''))
    .join('')

  return `<div class="sheet" style="--bands:${settings.bands}; --panel-h:${settings.panelHeightMm}mm; --font-pt:${settings.fontSizePt}pt; --sheet-margin:${settings.marginMm}mm; --grid-top:${gridTop}mm;">
    <div class="bands">${bandsHtml}</div>
    <svg class="marks" viewBox="0 0 ${A4.widthMm} ${A4.heightMm}" preserveAspectRatio="none">${foldDotsHtml}</svg>
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
