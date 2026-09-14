import { useRef, useState } from 'react'
import type { PromptSettings } from '../../types/recording'
import { installLocalFont } from '../../features/teleprompter/fonts'
import { Button, NativeSelect, Segmented, Slider, Switch } from '../ui/primitives'
import { PromptQuickControls } from './PromptReader'

export interface PromptSettingsPanelProps {
  settings: PromptSettings
  onChange: (patch: Partial<PromptSettings>) => void
  /** The compact mode is used inside the live recording prompt drawer. */
  compact?: boolean
  /** Adds copy that makes live updates explicit while capturing. */
  live?: boolean
}

type PresetName = 'lens' | 'minimal' | 'large'

const PRESETS: Record<PresetName, Partial<PromptSettings>> = {
  lens: { fontSize: 38, lineHeight: 1.25, columnWidth: 86, windowHeight: 34, backgroundOpacity: .38, readingLine: 16, textAlign: 'left', showReadingLine: true, dimSurrounding: true },
  minimal: { fontSize: 34, lineHeight: 1.25, columnWidth: 80, windowHeight: 30, backgroundOpacity: .24, readingLine: 18, textAlign: 'left', showReadingLine: true, dimSurrounding: true },
  large: { fontSize: 52, lineHeight: 1.22, columnWidth: 92, windowHeight: 42, backgroundOpacity: .5, readingLine: 16, textAlign: 'left', showReadingLine: true, dimSurrounding: false },
}

function presetFor(settings: PromptSettings): PresetName | '' {
  for (const name of Object.keys(PRESETS) as PresetName[]) {
    const preset = PRESETS[name]
    if (Object.entries(preset).every(([key, value]) => settings[key as keyof PromptSettings] === value)) return name
  }
  return ''
}

function PromptControlsFields({ settings, onChange, compact }: { settings: PromptSettings; onChange: (patch: Partial<PromptSettings>) => void; compact: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return <>
    <div className="tp-prompt-control-grid">
      <div className="tp-prompt-font-field"><NativeSelect label="Font" value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
        <option>DM Sans Variable</option><option>Barlow Condensed</option><option>JetBrains Mono Variable</option><option>Arial</option><option>Georgia</option><option>system-ui</option>{settings.fontFamily.startsWith('Creator Local ·') && <option>{settings.fontFamily}</option>}
      </NativeSelect><Button variant="link" size="small" className="tp-font-upload-button" onClick={() => fileRef.current?.click()}>Load a font from this device</Button><input ref={fileRef} className="sr-only" type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void installLocalFont(file).then((family) => onChange({ fontFamily: family })) }}/></div>
      <Slider label="Prompt window" value={settings.windowHeight ?? 34} min={20} max={65} step={1} display={`${settings.windowHeight ?? 34}% viewport`} onChange={(windowHeight) => onChange({ windowHeight })}/>
      <Slider label="Column width" value={settings.columnWidth} min={50} max={100} step={1} display={`${settings.columnWidth}%`} onChange={(columnWidth) => onChange({ columnWidth })}/>
      <Slider label="Horizontal position" value={settings.horizontalPosition ?? .5} min={0} max={1} step={.05} display={`${Math.round((settings.horizontalPosition ?? .5) * 100)}%`} onChange={(horizontalPosition) => onChange({ horizontalPosition })}/>
      <Slider label="Line height" value={settings.lineHeight} min={1.1} max={2} step={.05} display={settings.lineHeight.toFixed(2)} onChange={(lineHeight) => onChange({ lineHeight })}/>
      <Slider label="Letter spacing" value={settings.letterSpacing} min={-1} max={6} step={.1} display={`${settings.letterSpacing.toFixed(1)} px`} onChange={(letterSpacing) => onChange({ letterSpacing })}/>
    </div>
    <div className="tp-prompt-align-row"><span className="tp-control-label">Text alignment</span><Segmented label="Text alignment" value={settings.textAlign ?? 'left'} items={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }]} onChange={(textAlign) => onChange({ textAlign })}/></div>
    <div className="tp-prompt-colour-grid"><label className="tp-color-field"><span>Text colour</span><input type="color" value={settings.textColor} onChange={(event) => onChange({ textColor: event.target.value })}/></label><label className="tp-color-field"><span>Prompt background</span><input type="color" value={settings.backgroundColor} onChange={(event) => onChange({ backgroundColor: event.target.value })}/></label><Slider label="Background opacity" value={settings.backgroundOpacity} min={.08} max={1} step={.01} display={`${Math.round(settings.backgroundOpacity * 100)}%`} onChange={(backgroundOpacity) => onChange({ backgroundOpacity })}/></div>
    <div className="tp-toggle-row tp-prompt-toggles"><Switch label="Mirror prompt" checked={settings.mirror} onChange={(mirror) => onChange({ mirror })}/><Switch label="Dim surrounding text" checked={settings.dimSurrounding} onChange={(dimSurrounding) => onChange({ dimSurrounding })}/><Switch label="Show reading line" checked={settings.showReadingLine !== false} onChange={(showReadingLine) => onChange({ showReadingLine })}/></div>
    {!compact && <details className="tp-advanced"><summary>Additional timing and layout <span className="mono">CUSTOMIZE</span></summary><div className="tp-setting-grid"><Slider label="Side margins" value={settings.margin} min={0} max={24} step={1} display={`${settings.margin}%`} onChange={(margin) => onChange({ margin })}/><Slider label="Left gutter" value={settings.marginLeft ?? settings.margin} min={0} max={24} step={1} display={`${settings.marginLeft ?? settings.margin}%`} onChange={(marginLeft) => onChange({ marginLeft })}/><Slider label="Right gutter" value={settings.marginRight ?? settings.margin} min={0} max={24} step={1} display={`${settings.marginRight ?? settings.margin}%`} onChange={(marginRight) => onChange({ marginRight })}/><Slider label="Comma pause" value={settings.commaPause} min={0} max={.8} step={.02} display={`${settings.commaPause.toFixed(2)}s`} onChange={(commaPause) => onChange({ commaPause })}/><Slider label="Period pause" value={settings.periodPause} min={0} max={1.5} step={.05} display={`${settings.periodPause.toFixed(2)}s`} onChange={(periodPause) => onChange({ periodPause })}/><Slider label="Paragraph pause" value={settings.paragraphPause} min={0} max={2.5} step={.05} display={`${settings.paragraphPause.toFixed(2)}s`} onChange={(paragraphPause) => onChange({ paragraphPause })}/></div><div className="tp-toggle-row"><Switch label="Density-based line timing" checked={settings.lineTiming} onChange={(lineTiming) => onChange({ lineTiming })}/><Switch label="Honour punctuation pauses" checked={settings.punctuation} onChange={(punctuation) => onChange({ punctuation })}/><Switch label="Include cue pauses" checked={settings.autoPause} onChange={(autoPause) => onChange({ autoPause })}/><Switch label="High contrast" checked={settings.highContrast} onChange={(highContrast) => onChange({ highContrast })}/></div></details>}
  </>
}

export function PromptSettingsPanel({ settings, onChange, compact = false, live = false }: PromptSettingsPanelProps) {
  const [previous, setPrevious] = useState<PromptSettings | null>(null)
  const selectedPreset = presetFor(settings)
  const mode = settings.mode === 'timed' ? 'timed' : settings.mode === 'manual' ? 'manual' : 'fixed'
  const applyPreset = (name: PresetName) => { setPrevious(settings); onChange(PRESETS[name]) }
  return <div className={`tp-settings-panel ${compact ? 'tp-prompt-controls-compact' : ''} ${live ? 'tp-prompt-controls-live' : ''}`}>
    <div className="tp-panel-label"><span className="eyebrow-small">{live ? 'PROMPT CONTROLS' : 'READING SETUP'}</span><span className="mono">{live ? 'LIVE' : settings.mode === 'timed' ? `FINISH IN ${Math.round(settings.targetSeconds)}S` : settings.mode === 'manual' ? 'MANUAL' : `${settings.wpm} WPM`}</span></div>
    {live && <p className="tp-prompt-live-note">Changes apply to the reading layer while the camera keeps recording.</p>}
    {compact && <div className="tp-prompt-presets"><Segmented label="Prompt presets" value={selectedPreset} items={[{ value: 'lens', label: 'Lens' }, { value: 'minimal', label: 'Minimal' }, { value: 'large', label: 'Large text' }]} onChange={(name) => applyPreset(name as PresetName)}/>{previous && <Button variant="link" size="small" onClick={() => { onChange(previous); setPrevious(null) }}>Undo preset</Button>}</div>}
    <Segmented className="tp-mode-picker" label="Prompt mode" value={mode} items={[{ value: 'fixed', label: 'Fixed pace' }, { value: 'timed', label: 'Finish in' }, { value: 'manual', label: 'Manual' }]} onChange={(nextMode) => onChange({ mode: nextMode })}/>
    {settings.mode === 'timed' && <Slider
      label="Target duration"
      value={settings.targetSeconds}
      min={15}
      max={600}
      step={5}
      display={`${Math.round(settings.targetSeconds)} sec`}
      onChange={(targetSeconds) => onChange({ targetSeconds })}
    />}
    {!compact && <PromptQuickControls settings={settings} onChange={onChange}/>}
    {compact && <div className="tp-prompt-quick"><PromptQuickControls settings={settings} onChange={onChange}/></div>}
    <PromptControlsFields settings={settings} onChange={onChange} compact={compact}/>
  </div>
}
