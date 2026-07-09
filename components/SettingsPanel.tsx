'use client'

import { LIMITS } from '../src/lib/constants'
import type { Settings } from '../src/lib/types'

interface SettingsPanelProps {
  settings: Settings
  onChange: (settings: Settings) => void
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function SettingsPanel(props: SettingsPanelProps) {
  const updateBands = (v: number) =>
    props.onChange({ ...props.settings, bands: clamp(v, LIMITS.bands[0], LIMITS.bands[1]) })
  const updatePanelHeight = (v: number) =>
    props.onChange({ ...props.settings, panelHeightMm: clamp(v, LIMITS.panelHeightMm[0], LIMITS.panelHeightMm[1]) })
  const updateFontSize = (v: number) =>
    props.onChange({ ...props.settings, fontSizePt: clamp(v, LIMITS.fontSizePt[0], LIMITS.fontSizePt[1]) })

  return (
    <div className="settings-panel">
      <label className="settings-field">
        <span>帯の本数</span>
        <input
          type="number"
          min={LIMITS.bands[0]}
          max={LIMITS.bands[1]}
          value={props.settings.bands}
          onInput={(e) => updateBands(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      <label className="settings-field">
        <span>パネル高さ (mm)</span>
        <input
          type="number"
          min={LIMITS.panelHeightMm[0]}
          max={LIMITS.panelHeightMm[1]}
          value={props.settings.panelHeightMm}
          onInput={(e) => updatePanelHeight(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      <label className="settings-field">
        <span>フォントサイズ (pt)</span>
        <input
          type="number"
          min={LIMITS.fontSizePt[0]}
          max={LIMITS.fontSizePt[1]}
          value={props.settings.fontSizePt}
          onInput={(e) => updateFontSize(Number((e.target as HTMLInputElement).value))}
        />
      </label>
    </div>
  )
}
