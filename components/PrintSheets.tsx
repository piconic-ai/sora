'use client'

import { createMemo } from '@barefootjs/client'
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

// preserveAspectRatio is still missing from @barefootjs/jsx's <svg>
// attribute types. Spreading it from a const object literal folds it
// statically into both the SSR and client templates (a function-call spread
// would stay dynamic and drop from the client template).
const marksSvgAttrs: Record<string, string> = { preserveAspectRatio: 'none' }

// Plain-data view models for the printed sheets, rendered as nested JSX
// loops (sheets > bands > panels). This deep-nested reactive text — a panel's
// {panel.text} at loop depth 3 once this component is inlined into the App
// island — is exactly what @barefootjs 0.20.0 fixed (piconic-ai/barefootjs
// #2282); before that the innermost text child silently froze at its SSR
// value, which is why this component spent 0.18.x on an innerHTML workaround
// and 0.19.x on a flattened single-loop shape (see git history).
interface SheetVM {
  styleVars: string
  bands: BandVM[]
  // Fold guides: a dot at every fold-row × cut-line intersection. The dot
  // columns show where to cut the sheet into strips, and cutting slices
  // each dot in half, leaving a mark on both strips' edges at every fold
  // position — each strip carries its own fold guides, no ruler needed.
  // (No marks at the paper edges: printers often clip them, depending on
  // the printable-area settings.)
  dots: { x: number; y: number }[]
}

interface BandVM {
  panels: PanelVM[]
}

interface PanelVM {
  cls: string
  // Only set when the text needs a smaller-than-default size to fit its
  // band (see fitFontSizePt) — undefined otherwise, so the panel falls
  // back to the sheet's --font-pt.
  style: string | undefined
  text: string
}

function buildSheetVM(page: PageLayout, settings: Settings): SheetVM {
  const panelsPerBand = page.bands[0]?.panels.length ?? 0
  const geo = computeSheetGeometry(settings, panelsPerBand)
  return {
    styleVars: `--bands:${settings.bands}; --panel-h:${settings.panelHeightMm}mm; --font-pt:${settings.fontSizePt}pt; --sheet-margin:${settings.marginMm}mm; --grid-top:${geo.gridTop}mm;`,
    bands: page.bands.map((band) => ({
      panels: band.panels.map((panel) => {
        const fitted = panel.text
          ? fitFontSizePt(panel.text, geo.bandWidth, settings.fontSizePt)
          : settings.fontSizePt
        return {
          cls: panel.kind === 'empty' ? 'panel empty' : 'panel',
          style: fitted !== settings.fontSizePt ? `font-size:${fitted}pt` : undefined,
          text: panel.text,
        }
      }),
    })),
    dots: geo.cutBands.flatMap((x) => geo.foldRows.map((y) => ({ x, y }))),
  }
}

function buildSheetVMs(layout: LayoutResult, settings: Settings): SheetVM[] {
  return layout.pages.map((page) => buildSheetVM(page, settings))
}

export function PrintSheets(props: PrintSheetsProps) {
  const sheets = createMemo(() => buildSheetVMs(props.layout, props.settings))

  return (
    <div className="print-sheets">
      {sheets().map((sheet, si) => (
        <div key={si} className="sheet" style={sheet.styleVars}>
          <div className="bands">
            {sheet.bands.map((band, bi) => (
              <div key={bi} className="band">
                {band.panels.map((panel, pi) => (
                  <div key={pi} className={panel.cls} style={panel.style}>
                    {panel.text}
                  </div>
                ))}
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
