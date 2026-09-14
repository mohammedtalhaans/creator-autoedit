import type { PromptSettings } from '../../types/recording'
import { installLocalFont } from '../../features/teleprompter/fonts'
import { NativeSelect, Segmented, Slider, Switch } from '../ui/primitives'
import { PromptQuickControls } from './PromptReader'

export interface PromptSettingsPanelProps {
  settings: PromptSettings
  onChange: (patch: Partial<PromptSettings>) => void
}

export function PromptSettingsPanel({ settings, onChange }: PromptSettingsPanelProps) {
  const promptMode = settings.mode === 'timed' ? 'timed' : settings.mode === 'manual' ? 'manual' : 'fixed'
  return <div className="tp-settings-panel">
    <div className="tp-panel-label"><span className="eyebrow-small">READING SETUP</span><span className="mono">{settings.mode === 'timed' ? `FINISH IN ${Math.round(settings.targetSeconds)}S` : settings.mode === 'manual' ? 'MANUAL' : `${settings.wpm} WPM`}</span></div>
    <Segmented className="tp-mode-picker" label="Prompt mode" value={promptMode} items={[{ value: 'fixed', label: 'Fixed pace' }, { value: 'timed', label: 'Finish in' }, { value: 'manual', label: 'Manual' }]} onChange={(mode) => onChange({ mode })}/>
    {settings.mode === 'timed' && <Slider label="Target duration" value={settings.targetSeconds} min={15} max={600} step={5} display={`${Math.round(settings.targetSeconds)} sec`} onChange={(targetSeconds) => onChange({ targetSeconds })}/>}
    <PromptQuickControls settings={settings} onChange={onChange}/>
    <details className="tp-advanced">
      <summary>Text and layout <span className="mono">CUSTOMIZE</span></summary>
      <div className="tp-setting-grid">
        <div className="tp-field"><NativeSelect label="Font" value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
          <option>DM Sans Variable</option><option>Barlow Condensed</option><option>JetBrains Mono Variable</option><option>Arial</option><option>Georgia</option><option>system-ui</option>{settings.fontFamily.startsWith('Creator Local ·') && <option>{settings.fontFamily}</option>}
        </NativeSelect><label className="tp-font-upload">Load a font from this device<input type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void installLocalFont(file).then((family) => onChange({ fontFamily: family })) }}/></label></div>
        <Slider label="Column width" value={settings.columnWidth} min={48} max={94} step={1} display={`${settings.columnWidth}%`} onChange={(columnWidth) => onChange({ columnWidth })}/>
        <Slider label="Side margins" value={settings.margin} min={0} max={24} step={1} display={`${settings.margin}%`} onChange={(margin) => onChange({ margin })}/>
        <Slider label="Left gutter" value={settings.marginLeft ?? settings.margin} min={0} max={24} step={1} display={`${settings.marginLeft ?? settings.margin}%`} onChange={(marginLeft) => onChange({ marginLeft })}/>
        <Slider label="Right gutter" value={settings.marginRight ?? settings.margin} min={0} max={24} step={1} display={`${settings.marginRight ?? settings.margin}%`} onChange={(marginRight) => onChange({ marginRight })}/>
        <Slider label="Horizontal position" value={settings.horizontalPosition ?? .5} min={0} max={1} step={.05} display={`${Math.round((settings.horizontalPosition ?? .5) * 100)}%`} onChange={(horizontalPosition) => onChange({ horizontalPosition })}/>
        <Slider label="Line height" value={settings.lineHeight} min={1.1} max={2} step={.05} display={settings.lineHeight.toFixed(2)} onChange={(lineHeight) => onChange({ lineHeight })}/>
        <Slider label="Letter spacing" value={settings.letterSpacing} min={-1} max={6} step={.1} display={`${settings.letterSpacing.toFixed(1)} px`} onChange={(letterSpacing) => onChange({ letterSpacing })}/>
        <Slider label="Lens line" value={settings.readingLine} min={10} max={65} step={1} display={`${settings.readingLine}%`} onChange={(readingLine) => onChange({ readingLine })}/>
        <label className="tp-color-field"><span>Text colour</span><input type="color" value={settings.textColor} onChange={(event) => onChange({ textColor: event.target.value })}/></label>
        <label className="tp-color-field"><span>Prompt background</span><input type="color" value={settings.backgroundColor} onChange={(event) => onChange({ backgroundColor: event.target.value })}/></label>
        <Slider label="Background opacity" value={settings.backgroundOpacity} min={.55} max={1} step={.01} display={`${Math.round(settings.backgroundOpacity * 100)}%`} onChange={(backgroundOpacity) => onChange({ backgroundOpacity })}/>
        <Slider label="Comma pause" value={settings.commaPause} min={0} max={.8} step={.02} display={`${settings.commaPause.toFixed(2)}s`} onChange={(commaPause) => onChange({ commaPause })}/>
        <Slider label="Period pause" value={settings.periodPause} min={0} max={1.5} step={.05} display={`${settings.periodPause.toFixed(2)}s`} onChange={(periodPause) => onChange({ periodPause })}/>
        <Slider label="Paragraph pause" value={settings.paragraphPause} min={0} max={2.5} step={.05} display={`${settings.paragraphPause.toFixed(2)}s`} onChange={(paragraphPause) => onChange({ paragraphPause })}/>
      </div>
      <div className="tp-toggle-row">
        <Switch label="Density-based line timing" checked={settings.lineTiming} onChange={(lineTiming) => onChange({ lineTiming })}/>
        <Switch label="Honour punctuation pauses" checked={settings.punctuation} onChange={(punctuation) => onChange({ punctuation })}/>
        <Switch label="Include cue pauses" checked={settings.autoPause} onChange={(autoPause) => onChange({ autoPause })}/>
        <Switch label="Mirror prompt" checked={settings.mirror} onChange={(mirror) => onChange({ mirror })}/>
        <Switch label="High contrast" checked={settings.highContrast} onChange={(highContrast) => onChange({ highContrast })}/>
        <Switch label="Dim surrounding text" checked={settings.dimSurrounding} onChange={(dimSurrounding) => onChange({ dimSurrounding })}/>
      </div>
    </details>
  </div>
}
