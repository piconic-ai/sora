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

// 0.4mm, not larger: a ~0.8mm printed dot is enough to fold against yet
// vanishes on the finished card.
const DOT_R_MM = 0.4

// Spread from a const literal, not inline or from a function call:
// preserveAspectRatio isn't in @barefootjs/jsx's <svg> types yet, and only a
// const-literal spread folds statically into the client template — a
// function-call spread stays dynamic and drops out of it.
const marksSvgAttrs: Record<string, string> = { preserveAspectRatio: 'none' }

interface SheetVM {
  styleVars: string
  bands: BandVM[]
  // A dot at every fold-row × cut-line intersection, not ticks at the paper
  // edge: cutting the sheet into strips halves each dot onto both strip edges
  // (so every strip keeps its own fold guides), while edge marks would land
  // in the printer's clipped margin.
  dots: { x: number; y: number }[]
}

interface BandVM {
  panels: PanelVM[]
}

interface PanelVM {
  cls: string
  // undefined unless the word must shrink to fit its band — the panel then
  // inherits the sheet's --font-pt rather than pinning a size.
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

export function PrintSheets(props: PrintSheetsProps) {
  const sheets = createMemo(() => props.layout.pages.map((page) => buildSheetVM(page, props.settings)))

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
