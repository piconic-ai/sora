'use client'

import { createMemo } from '@barefootjs/client'
import type { LayoutResult, Settings } from '../src/lib/types'
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

// preserveAspectRatio is still missing from @barefootjs/jsx's <svg>
// attribute types (noted in piconic-ai/barefootjs#2264). Spreading it from
// a const object literal folds it statically into both the SSR and client
// templates (a function-call spread would stay dynamic and drop from the
// client template).
const marksSvgAttrs: Record<string, string> = { preserveAspectRatio: 'none' }

// Plain-data view model for one printed sheet, rendered as JSX loops since
// @barefootjs 0.19.1 fixed piconic-ai/barefootjs#2264 (this component's
// previous life was an innerHTML workaround — see git history).
//
// The panel list is deliberately FLAT (band-major order), not nested
// bands > panels: this component is inlined into the App island, which
// puts a bands loop's panel text at nesting depth 3 — one deeper than the
// depth-2 case #2264 fixed — and its textContent update effect silently
// vanishes again. A flat sheets > panels shape keeps the reactive word
// text at depth 2, and CSS grid (grid-auto-flow: column, see print.css's
// .sheet .bands) reproduces the exact same column layout the nested
// markup had.
interface SheetVM {
  styleVars: string
  panels: PanelVM[]
  // Fold guides: a dot at every fold-row × cut-line intersection. The dot
  // columns show where to cut the sheet into strips, and cutting slices
  // each dot in half, leaving a mark on both strips' edges at every fold
  // position — each strip carries its own fold guides, no ruler needed.
  // (No marks at the paper edges: printers often clip them, depending on
  // the printable-area settings.)
  dots: { x: number; y: number }[]
}

interface PanelVM {
  cls: string
  // Only set when the text needs a smaller-than-default size to fit its
  // band (see fitFontSizePt) — undefined otherwise, so the panel falls
  // back to the sheet's --font-pt.
  style: string | undefined
  text: string
}

export function PrintSheets(props: PrintSheetsProps) {
  // Lives inside the component (not module level): the client-JS inliner
  // only traces imports referenced from the component body's closures, so a
  // top-level helper calling computeSheetGeometry/fitFontSizePt ships to the
  // browser without their definitions (ReferenceError at runtime; found the
  // hard way after the 0.19.1 upgrade — candidate for a barefootjs issue).
  const buildSheetVMs = (layout: LayoutResult, settings: Settings): SheetVM[] =>
    layout.pages.map((page) => {
      const panelsPerBand = page.bands[0]?.panels.length ?? 0
      const geo = computeSheetGeometry(settings, panelsPerBand)
      return {
        styleVars: `--bands:${settings.bands}; --rows:${panelsPerBand}; --panel-h:${settings.panelHeightMm}mm; --font-pt:${settings.fontSizePt}pt; --sheet-margin:${settings.marginMm}mm; --grid-top:${geo.gridTop}mm;`,
        panels: page.bands.flatMap((band) =>
          band.panels.map((panel) => {
            const fitted = panel.text
              ? fitFontSizePt(panel.text, geo.bandWidth, settings.fontSizePt)
              : settings.fontSizePt
            return {
              cls: panel.kind === 'empty' ? 'panel empty' : 'panel',
              style: fitted !== settings.fontSizePt ? `font-size:${fitted}pt` : undefined,
              text: panel.text,
            }
          }),
        ),
        dots: geo.cutBands.flatMap((x) => geo.foldRows.map((y) => ({ x, y }))),
      }
    })

  const sheets = createMemo(() => buildSheetVMs(props.layout, props.settings))

  return (
    <div className="print-sheets">
      {sheets().map((sheet, si) => (
        <div key={si} className="sheet" style={sheet.styleVars}>
          <div className="bands">
            {sheet.panels.map((panel, pi) => (
              <div key={pi} className={panel.cls} style={panel.style}>
                {panel.text}
              </div>
            ))}
          </div>
          <svg className="marks" viewBox={`0 0 ${A4.widthMm} ${A4.heightMm}`} {...marksSvgAttrs}>
            {sheet.dots.map((dot, di) => (
              <circle key={di} cx={dot.x} cy={dot.y} r={DOT_R_MM} />
            ))}
          </svg>
        </div>
      ))}
    </div>
  )
}
