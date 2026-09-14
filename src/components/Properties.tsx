import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Captions, AudioLines, ScanFace, ArrowUpRight, RotateCcw, SlidersHorizontal, Check, Play, AlignLeft, AlignCenter, AlignRight, Volume2, Mic, ShieldCheck, ChevronDown } from 'lucide-react';
import { studio, useStudio } from '../app/store';
import type { Project, Module, CaptionConfig, FramingConfig, Phrase, CaptionPreset, AppearanceLook } from '../types/project';
import { EditMap } from '../features/edit-map';
import { projectCuts } from '../features/silence';
import { captionPresets, captionPresetLabels, groupWords, correctPhrase } from '../features/captions';
import { NumberTicker } from './magic/signal';
import { Button, Slider, Switch, Segmented } from './ui/primitives';
import { TaskRow } from './TaskRow';
import { timecode, cn } from '../lib/utils';
export const modules: {
    id: Module;
    label: string;
    icon: typeof Scissors;
    number: string;
}[] = [{ id: 'cut', label: 'Cut', icon: Scissors, number: '01' }, { id: 'captions', label: 'Captions', icon: Captions, number: '02' }, { id: 'audio', label: 'Audio', icon: AudioLines, number: '03' }, { id: 'frame', label: 'Frame', icon: ScanFace, number: '04' }];
export function ModuleRail({ active, onChange, className }: {
    active: Module;
    onChange: (m: Module) => void;
    className?: string;
}) {
    return <div className={cn('module-rail', className)} role="tablist" aria-label="Editing modules">{modules.map(m => <button key={m.id} role="tab" type="button" aria-selected={active === m.id} aria-controls={`panel-${m.id}`} id={`tab-${m.id}`} tabIndex={active === m.id ? 0 : -1} onClick={() => onChange(m.id)} onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const i = modules.findIndex(x => x.id === m.id), next = modules[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4];
                    onChange(next.id);
                    requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
                }
            }} className={cn(active === m.id && 'active')}>
  {active === m.id && <motion.span className="module-selection" layoutId={`module-selector-${className ?? 'desktop'}`} transition={{ type: 'spring', stiffness: 380, damping: 32 }}/>}<m.icon size={18}/><span>{m.label}</span>
 </button>)}</div>;
}
const Header = ({ number, title, description, children }: {
    number: string;
    title: string;
    description: string;
    children?: ReactNode;
}) => <div className="property-heading"><div className="property-kicker mono"><span>MODULE / {number}</span>{children}</div><h2>{title}</h2><p>{description}</p></div>;
export function Properties({ project, map, module, sourceTime, level, voiceRaw, onVoiceRaw, onSeek, onGuides }: {
    project: Project;
    map: EditMap;
    module: Module;
    sourceTime: number;
    level: number;
    voiceRaw: boolean;
    onVoiceRaw: (v: boolean) => void;
    onSeek: (t: number) => void;
    onGuides: () => void;
}) {
    const state = useStudio();
    const captions = (patch: Partial<CaptionConfig>) => studio.patch({ captions: { ...project.captions, ...patch } });
    const frame = (patch: Partial<FramingConfig>) => studio.setFraming(patch);
    const cuts = projectCuts(project);
    const restore = (id: string, enabled: boolean) => studio.patch({ overrides: { ...project.overrides, [id]: enabled } });
    const preset = (name: CaptionPreset) => captions({ ...captionPresets[name], preset: name, enabled: true });
    const activeLook: AppearanceLook = project.appearance?.look ?? (['natural', 'soft', 'vivid', 'warm', 'mono', 'cool'].includes(project.recording?.look ?? '') ? project.recording!.look as AppearanceLook : 'natural');
    return <div id={`panel-${module}`} role="tabpanel" aria-labelledby={`tab-${module}`} className={cn('properties', `properties-${module}`)}>
  <AnimatePresence mode="wait" initial={false}><motion.div key={module} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .2 }}>
  {module === 'cut' && <><Header number="01" title="Find your flow." description="Keep the thought. Lose the dead air."><Scissors size={14}/></Header>
   <div className="cut-result"><div><span className="eyebrow-small">MADE ROOM FOR</span><div className="cut-number"><NumberTicker value={project.metadata.duration - map.outputDuration}/><span>seconds</span></div></div><span className="cut-result-icon"><Scissors size={20}/></span></div>
   <Segmented label="AutoCut pacing" value={project.cutPreset} onChange={cutPreset => studio.setCutPreset(cutPreset)} items={[{ value: 'natural', label: 'Natural', disabled: !project.metadata.hasAudio, disabledReason: 'Natural pacing needs an audio track' }, { value: 'tight', label: 'Tight', disabled: !project.metadata.hasAudio, disabledReason: 'Tight pacing needs an audio track' }, { value: 'jump', label: 'Jump cut', disabled: !project.metadata.hasAudio, disabledReason: 'Jump cuts need an audio track' }, { value: 'off', label: 'Off' }]}/>
   <p className="setting-explanation">{project.cutPreset === 'natural' ? 'Conversational pacing, with room to breathe.' : project.cutPreset === 'tight' ? 'A faster rhythm. Less space between thoughts.' : project.cutPreset === 'jump' ? 'Almost no gap between spoken sections.' : 'Every moment of your original video is kept.'}</p>
   <div className="section-label"><span>DETECTOR</span><span className="mono">{(project.cutConfig?.detector ?? (project.cutPreset === 'jump' ? 'speech' : 'energy')) === 'speech' ? 'LOCAL MODEL' : 'INSTANT OFFLINE'}</span></div>
   <Segmented label="Pause detector" value={project.cutConfig?.detector ?? (project.cutPreset === 'jump' ? 'speech' : 'energy')} onChange={detector => studio.setCutConfig({ detector })} items={[{ value: 'energy', label: 'Energy', disabled: !project.metadata.hasAudio, disabledReason: 'Energy detection needs an audio track' }, { value: 'speech', label: 'Speech-aware', disabled: !project.metadata.hasAudio, disabledReason: 'Speech-aware detection needs an audio track' }]}/>
   <p className="setting-explanation">{(project.cutConfig?.detector ?? (project.cutPreset === 'jump' ? 'speech' : 'energy')) === 'speech' ? project.speechStatus?.detail ?? 'The local speech model protects quiet spoken words.' : 'Fast waveform energy is available offline. Speech-aware mode protects quiet voices more reliably.'}</p>
   {(project.cutConfig?.detector ?? (project.cutPreset === 'jump' ? 'speech' : 'energy')) === 'speech' && ['fallback', 'error'].includes(project.speechStatus?.status ?? '') && <Button size="small" variant="ghost" onClick={() => void studio.analyzeSpeech()}><RotateCcw size={13}/>Retry speech-aware detection</Button>}
   <div className="duration-comparison"><div><span>RAW TAKE</span><NumberTicker value={project.metadata.duration} format={timecode}/></div><ArrowUpRight size={17}/><div><span>YOUR EDIT</span><NumberTicker value={map.outputDuration} format={timecode}/></div></div>
   <div className="section-label"><span>THE PAUSES</span><span className="mono">{cuts.filter(c => c.enabled).length} REMOVED</span></div>
   <div className="cut-list">{cuts.length ? cuts.map((cut, i) => <div className={cn('cut-item', !cut.enabled && 'restored')} key={cut.id}><button className="cut-time" onClick={() => onSeek(Math.max(0, cut.start - .4))} aria-label={`Preview pause ${i + 1}`}><span className="mono cut-index">{String(i + 1).padStart(2, '0')}</span><span><strong className="mono">{timecode(cut.start)}</strong><small>{(cut.end - cut.start).toFixed(1)}s pause</small></span></button><button className="cut-toggle" aria-pressed={cut.enabled} onClick={() => restore(cut.id, !cut.enabled)}>{cut.enabled ? <Scissors size={12}/> : <Check size={12}/>}<span>{cut.enabled ? 'Removed' : 'Kept'}</span></button></div>) : <div className="quiet-state"><AudioLines size={24}/><strong>{project.metadata.hasAudio ? 'No long pauses found' : 'No audio to cut'}</strong><p>{project.metadata.hasAudio ? 'Your take is already moving. Try Tight for shorter pauses.' : 'You can still frame and export this video.'}</p></div>}{project.metadata.hasAudio && project.waveform.speechDb <= -65 && <div className="quiet-state all-silent-state"><AudioLines size={24}/><strong>All-silent clip · keeping it safe</strong><p>There is no spoken signal to protect. The original take stays available; review the raw video before trimming.</p></div>}</div>
  </>}
  {module === 'captions' && <><Header number="02" title="Let the words land." description="Good type. Timed to your voice."><Captions size={14}/></Header>
   <Switch label="Captions" description={!project.metadata.hasAudio ? 'No audio track detected' : undefined} checked={project.captions.enabled} onChange={enabled => captions({ enabled })} disabled={!project.metadata.hasAudio}/>
   <div className="preset-grid">{(Object.keys(captionPresets) as CaptionPreset[]).map(name => <button type="button" className={cn('caption-preset', `preset-${name}`, project.captions.preset === name && 'selected')} key={name} aria-label={`${captionPresetLabels[name]} caption style`} aria-pressed={project.captions.preset === name} onClick={() => preset(name)}><span className="preset-sample">Make it <em>count.</em></span><span className="preset-name mono">{captionPresetLabels[name]}{project.captions.preset === name && <Check size={12}/>}</span></button>)}</div>
   <div className="section-label"><span>WORDS PER CARD</span><span className="mono">{project.captions.maxWords ?? 3} / 8</span></div>
   <div className="caption-count-options" role="group" aria-label="Words per caption card">{[1, 2, 3, 4].map(value => <button key={value} type="button" className={cn((project.captions.maxWords ?? 3) === value && 'selected')} aria-pressed={(project.captions.maxWords ?? 3) === value} onClick={() => captions({ maxWords: value })}>{value}</button>)}<input aria-label="Words per caption card, one to eight" type="range" min={1} max={8} step={1} value={project.captions.maxWords ?? 3} onChange={e => captions({ maxWords: Number(e.target.value) })}/></div>
   <Segmented label="Caption lines" value={String(project.captions.maxLines ?? 2)} onChange={maxLines => captions({ maxLines: Number(maxLines) })} items={[{ value: '1', label: '1 line' }, { value: '2', label: '2 lines' }]}/>
   <div className="section-label"><span>MOVEMENT</span><span className="mono">BURNED INTO EXPORT</span></div>
   <Segmented label="Caption animation" value={project.captions.animation} onChange={animation => captions({ animation })} items={[{ value: 'pop', label: 'Pop' }, { value: 'word', label: 'Word' }, { value: 'smooth', label: 'Smooth' }]}/>
   <Segmented label="Active word highlight" value={project.captions.highlight ? 'accent' : 'off'} onChange={highlight => captions({ highlight: highlight === 'accent' })} items={[{ value: 'accent', label: 'Accent' }, { value: 'off', label: 'Off' }]}/>
   <div className="section-label"><span>YOUR WORDS</span><span className="mono">{project.words.length} WORDS / EN</span></div>
   {state.tasks.captions.status === 'running' ? <><TaskRow title="Building captions locally" task={state.tasks.captions} compact/><Button variant="ghost" size="small" onClick={() => studio.cancelTask('captions')}>Cancel captions</Button></> : project.words.length ? <div className="transcript-editor">{groupWords(project.words, 6, 48).map(phrase => <TranscriptPhrase key={phrase.id} phrase={phrase} active={sourceTime >= phrase.start && sourceTime < phrase.end} onSeek={() => onSeek(phrase.start)} onCommit={text => studio.patch({ words: correctPhrase(project.words, phrase.words.map(w => w.id), text) })}/>)}</div> : <div className="quiet-state"><Captions size={25}/><strong>{state.tasks.captions.status === 'error' ? 'Captions need another try' : 'Your voice, in words.'}</strong><p>{state.tasks.captions.status === 'error' ? state.tasks.captions.detail : 'English speech recognition runs on your device. The first use downloads a speech model.'}</p><Button onClick={() => void studio.transcribe()} disabled={!project.metadata.hasAudio || state.tasks.audio.status !== 'done'}><RotateCcw size={14}/>{state.tasks.captions.status === 'error' ? 'Retry captions' : 'Generate captions'}</Button></div>}
   {!!project.words.length && <p className="setting-explanation">Click a phrase to correct it. Original word timing is preserved when possible.</p>}
  </>}
  {module === 'audio' && <><Header number="03" title="A clearer you." description="Less room. More voice. Still natural."><AudioLines size={15}/></Header>
   <div className={cn('audio-instrument', project.audio.enabled && !voiceRaw && 'enhanced')}><div className="instrument-top"><span className="mono">{project.audio.enabled && !voiceRaw ? 'ENHANCED SIGNAL' : 'SOURCE SIGNAL'}</span><Volume2 size={14}/></div><div className="level-meter" role="meter" aria-label="Live voice level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, 20 * Math.log10(Math.max(.001, level)))}>{Array.from({ length: 25 }, (_, i) => <i key={i} className={cn(i > 21 && 'meter-peak', i < Math.max(0, (20 * Math.log10(Math.max(.001, level)) + 60) / 60 * 25) && 'lit')}/>)}</div><div className="meter-ruler mono"><span>−60</span><span>−24</span><span>−12</span><span>0 dB</span></div><div className="instrument-values"><div><span>VOICE LEVEL</span><strong className="mono">{project.audioStats && project.audio.enabled && !voiceRaw ? project.audioStats.rmsDb.toFixed(1) : (project.sourceAudioStats?.rmsDb ?? -90).toFixed(1)}<small> dB</small></strong></div><div><span>PROCESSING</span><strong>{project.audio.enabled ? 'Voice Enhance' : 'Original'}</strong></div></div></div>
   <Switch label="Voice Enhance" description="Gentle filtering, compression & level balance" checked={project.audio.enabled} onChange={enabled => studio.setAudio({ enabled })} disabled={!project.metadata.hasAudio}/>
   <div className="section-label"><span>NOISE REDUCTION</span><span className="mono">LOCAL RNNOISE</span></div>
   <Segmented label="Noise reduction strength" value={project.audio.noise} onChange={noise => studio.setAudio({ noise })} items={[{ value: 'off', label: 'Off', disabled: !project.metadata.hasAudio || !project.audio.enabled, disabledReason: !project.metadata.hasAudio ? 'Noise reduction needs an audio track' : 'Turn on Voice Enhance first' }, { value: 'light', label: 'Light', disabled: !project.metadata.hasAudio || !project.audio.enabled, disabledReason: !project.metadata.hasAudio ? 'Noise reduction needs an audio track' : 'Turn on Voice Enhance first' }, { value: 'strong', label: 'Strong', disabled: !project.metadata.hasAudio || !project.audio.enabled, disabledReason: !project.metadata.hasAudio ? 'Noise reduction needs an audio track' : 'Turn on Voice Enhance first' }]}/>
   <p className="setting-explanation">Light keeps a little room tone. Strong is best for a noisier space.</p>
   <div className="audio-compare"><div><Mic size={15}/><span>Hear the difference</span></div><Segmented label="Voice comparison" value={voiceRaw ? 'raw' : 'enhanced'} onChange={v => onVoiceRaw(v === 'raw')} items={[{ value: 'raw', label: 'Raw', disabled: !state.audioUrl }, { value: 'enhanced', label: 'Enhanced', disabled: !state.audioUrl }]}/><small>Same moment. Tap play, then switch.</small></div>
   {state.tasks.voice.status === 'running' && <><TaskRow title="Cleaning your voice" task={state.tasks.voice} compact/><Button size="small" variant="ghost" onClick={() => { studio.cancelTask('voice'); studio.setAudio({ enabled: false }); }}>Use original voice</Button></>}
   {state.tasks.audio.status !== 'done' && project.metadata.hasAudio && <Button onClick={() => void studio.analyzeAudio().then(() => studio.enhance())} disabled={state.tasks.audio.status === 'running'}><RotateCcw size={14}/>Retry audio analysis</Button>}
   {state.tasks.voice.status === 'error' && <p className="inline-warning">{state.tasks.voice.detail}</p>}
   {project.audioStats?.warning && <p className="inline-warning">{project.audioStats.warning}</p>}
  </>}
  {module === 'frame' && <><Header number="04" title="Made for the feed." description="Your subject. In the right place."><ScanFace size={15}/></Header>
   <div className="ratio-options">{[{ id: 'vertical', label: 'Reel / TikTok', ratio: '9:16' }, { id: 'square', label: 'Square', ratio: '1:1' }, { id: 'original', label: 'Original', ratio: 'SOURCE' }].map(item => <button key={item.id} type="button" aria-pressed={project.framing.ratio === item.id} className={cn('ratio-option', project.framing.ratio === item.id && 'selected')} onClick={() => frame({ ratio: item.id as FramingConfig['ratio'] })}><span className={`ratio-glyph ratio-${item.id}`}/><strong>{item.ratio}</strong><small>{item.label}</small></button>)}</div>
   <div className="section-label"><span>FRAMING MODE</span><span className="mono">{project.faces.length ? 'SUBJECT FOUND' : 'MANUAL READY'}</span></div>
   <Segmented label="Framing mode" value={project.framing.mode} onChange={mode => {
                if (mode === 'auto' && !project.faces.length)
                    void studio.frame();
                else
                    frame({ mode });
            }} items={[{ value: 'auto', label: 'Auto' }, { value: 'fill', label: 'Fill' }, { value: 'blur', label: 'Blur' }, { value: 'fit', label: 'Fit' }]}/>
   <div className="frame-readout"><div className="frame-readout-grid"><div className="crop-outline"><span /><span /><span /><span /></div><ScanFace size={46} strokeWidth={.9}/></div><div><strong>{project.framing.mode === 'auto' ? 'Following your lead.' : project.framing.mode === 'blur' ? 'Full picture. Soft backdrop.' : project.framing.mode === 'fit' ? 'Nothing left out.' : 'You’re in control.'}</strong><p>{project.framing.mode === 'auto' ? 'A smoothed subject path, not a twitchy crop.' : 'Drag the preview to reposition. Pinch or use the zoom control.'}</p></div></div>
   <Slider label="Zoom" value={project.framing.zoom} min={1} max={2.5} step={.01} onChange={zoom => frame({ zoom })} display={`${Math.round(project.framing.zoom * 100)}%`} disabled={['blur', 'fit'].includes(project.framing.mode)}/>
   <div className="frame-actions"><Button size="small" onClick={() => frame({ x: .5, y: .5, zoom: 1, mode: 'fill' })}><RotateCcw size={13}/>Reset frame</Button><Button size="small" variant="ghost" onClick={() => {
                if (project.faces.length)
                    frame({ mode: 'auto', zoom: 1 });
                else
                    void studio.frame();
            }} disabled={state.tasks.face.status === 'running'}><ScanFace size={14}/>Auto frame</Button></div>
   {state.tasks.face.status === 'running' && <><TaskRow title="Framing your subject" task={state.tasks.face} compact/><Button size="small" variant="ghost" onClick={() => studio.cancelTask('face')}>Use manual framing</Button></>}
   {state.tasks.face.status === 'error' && <p className="inline-warning">{state.tasks.face.detail}</p>}
  </>}
   <details className="advanced-details inline-details" open><summary><SlidersHorizontal size={15}/><span>{module === 'captions' ? 'Type, colour & placement' : module === 'frame' ? 'Frame & appearance' : 'Fine-tune'}</span><ChevronDown size={14}/></summary><div className="advanced-details-body">
    {module === 'cut' && <><Slider label="Pause sensitivity" value={project.sensitivity} onChange={sensitivity => studio.patch({ sensitivity })} display={project.sensitivity < .35 ? 'Relaxed' : project.sensitivity > .65 ? 'Sensitive' : 'Balanced'}/><Slider label="Minimum silence" value={project.cutConfig?.minPause ?? (project.cutPreset === 'jump' ? .064 : .7)} min={.04} max={2} step={.001} onChange={minPause => studio.setCutConfig({ minPause })} display={`${(project.cutConfig?.minPause ?? (project.cutPreset === 'jump' ? .064 : .7)).toFixed(3)}s`}/><Slider label="Speech edge padding" value={project.cutConfig?.padding ?? (project.cutPreset === 'jump' ? .01 : .19)} min={0} max={.4} step={.001} onChange={padding => studio.setCutConfig({ padding })} display={`${(project.cutConfig?.padding ?? (project.cutPreset === 'jump' ? .01 : .19)).toFixed(3)}s`}/><p className="setting-explanation">Padding keeps consonants and breaths around a cut. Jump cut trims almost all silent space while preserving timestamped words.</p><Switch label="Dynamic punch · Low" description="An occasional 3.5% push-in around a jump cut" checked={project.framing.punch} onChange={punch => frame({ punch })}/><Button onClick={() => studio.patch({ overrides: {}, sensitivity: .5, cutConfig: { detector: 'speech', minPause: .064, padding: .01 } })}><RotateCcw size={14}/>Reset cut adjustments</Button></>}
    {module === 'captions' && <><div className="field-label"><label htmlFor="caption-font">Typeface</label></div><select id="caption-font" className="select" value={project.captions.font} onChange={e => captions({ font: e.target.value as CaptionConfig['font'] })}><option value="studio">Studio Grotesk</option><option value="condensed">Condensed</option><option value="mono">Technical Mono</option></select>
     <Slider label="Size" value={project.captions.size} min={.5} max={1.6} onChange={size => captions({ size })} display={`${Math.round(project.captions.size * 100)}%`}/><Slider label="Font weight" value={project.captions.fontWeight ?? 800} min={400} max={900} step={10} onChange={fontWeight => captions({ fontWeight })} display={`${project.captions.fontWeight ?? 800}`}/><Slider label="Letter spacing" value={project.captions.letterSpacing ?? 0} min={0} max={8} step={.1} onChange={letterSpacing => captions({ letterSpacing })} display={`${(project.captions.letterSpacing ?? 0).toFixed(1)}px`}/>
     <Slider label="Vertical position" value={project.captions.y} min={.12} max={.84} onChange={y => { captions({ y }); onGuides(); }} display={`${Math.round(project.captions.y * 100)}%`}/><Segmented label="Text alignment" value={project.captions.align} onChange={align => captions({ align })} items={[{ value: 'left', label: <><AlignLeft size={16}/><span className="sr-only">Left</span></> }, { value: 'center', label: <><AlignCenter size={16}/><span className="sr-only">Center</span></> }, { value: 'right', label: <><AlignRight size={16}/><span className="sr-only">Right</span></> }]}/>
     <div className="colour-fields"><label>Text<input type="color" value={project.captions.color} onChange={e => captions({ color: e.target.value })}/></label><label>Accent<input type="color" value={project.captions.accent} onChange={e => captions({ accent: e.target.value })}/></label><label>Outline<input type="color" value={project.captions.outlineColor ?? '#101010'} onChange={e => captions({ outlineColor: e.target.value })}/></label><label>Plate<input type="color" value={project.captions.backgroundColor ?? '#08090a'} onChange={e => captions({ backgroundColor: e.target.value })}/></label></div>
     <Slider label="Outline width" value={project.captions.outlineWidth ?? 2} min={0} max={8} step={.5} onChange={outlineWidth => captions({ outlineWidth })} display={`${(project.captions.outlineWidth ?? 2).toFixed(1)}px`}/><Slider label="Plate corner radius" value={project.captions.cornerRadius ?? 8} min={0} max={32} step={1} onChange={cornerRadius => captions({ cornerRadius })} display={`${project.captions.cornerRadius ?? 8}px`}/><Slider label="Line gap" value={project.captions.lineGap ?? .12} min={0} max={1} step={.01} onChange={lineGap => captions({ lineGap })} display={`${Math.round((project.captions.lineGap ?? .12) * 100)}%`}/>
      <Switch label="Italic" checked={project.captions.italic ?? false} onChange={italic => captions({ italic })}/><Switch label="Uppercase" checked={project.captions.uppercase} onChange={uppercase => captions({ uppercase })}/><Switch label="Text shadow" checked={project.captions.shadow} onChange={shadow => captions({ shadow })}/><Switch label="Backing plate" checked={project.captions.background} onChange={background => captions({ background })}/>
     {project.captions.background && <Slider label="Plate opacity" value={project.captions.opacity} onChange={opacity => captions({ opacity })} display={`${Math.round(project.captions.opacity * 100)}%`}/>}
     <details className="advanced-details"><summary>Social safe zones</summary><p className="setting-explanation">Guides are editable and never included in your export. Social interfaces can change.</p>{(['top', 'bottom', 'left', 'right'] as const).map(side => <Slider key={side} label={`${side[0].toUpperCase() + side.slice(1)} inset`} value={project.captions.safe[side]} min={0} max={.32} onChange={v => { captions({ safe: { ...project.captions.safe, [side]: v } }); onGuides(); }} display={`${Math.round(project.captions.safe[side] * 100)}%`}/>)}</details>
    </>}
    {module === 'audio' && <><Slider label="Output volume" value={project.audio.volume} min={0} max={1} onChange={volume => studio.setAudio({ volume })} display={`${Math.round(project.audio.volume * 100)}%`}/><div className="signal-chain"><span>75 Hz high-pass</span><i>→</i><span>Presence</span><i>→</i><span>Gentle compression</span><i>→</i><span>Level balance</span><i>→</i><span>−1 dB peak ceiling</span></div><p className="setting-explanation">Processing is designed for one speaking voice. It is not music mastering or studio reconstruction.</p></>}
    {module === 'frame' && <><Slider label="Horizontal centre" value={project.framing.x} onChange={x => frame({ x, mode: 'fill' })} display={`${Math.round(project.framing.x * 100)}%`}/><Slider label="Vertical centre" value={project.framing.y} onChange={y => frame({ y, mode: 'fill' })} display={`${Math.round(project.framing.y * 100)}%`}/><Switch label="Dynamic punch · Low" description="Subtle variety on occasional jump cuts" checked={project.framing.punch} onChange={punch => frame({ punch })}/><div className="section-label"><span>APPEARANCE</span><span className="mono">EDITED PIXELS ONLY</span></div><Segmented label="Appearance look" value={activeLook} onChange={look => studio.patch({ appearance: { look, intensity: project.appearance?.intensity ?? 1 } })} items={(['natural', 'soft', 'vivid', 'warm', 'mono', 'cool'] as AppearanceLook[]).map(look => ({ value: look, label: look[0].toUpperCase() + look.slice(1) }))}/><Slider label="Look intensity" value={project.appearance?.intensity ?? 1} min={0} max={1} step={.01} onChange={intensity => studio.patch({ appearance: { look: activeLook, intensity } })} display={`${Math.round((project.appearance?.intensity ?? 1) * 100)}%`}/><p className="setting-explanation">The raw monitor stays untouched. This look is applied to edited preview and exported pixels.</p>{project.recording?.portraitEffects && <><div className="section-label"><span>PORTRAIT EFFECTS</span><span className="mono">LOCAL MASK</span></div><Slider label="Background blur" value={project.recording.portraitEffects.backgroundBlur} min={0} max={1} step={.01} onChange={backgroundBlur => studio.patch({ recording: { ...project.recording!, portraitEffects: { ...project.recording!.portraitEffects!, backgroundBlur } } })} display={`${Math.round(project.recording.portraitEffects.backgroundBlur * 100)}%`}/><Slider label="Skin softening" value={project.recording.portraitEffects.skinSmoothing} min={0} max={1} step={.01} onChange={skinSmoothing => studio.patch({ recording: { ...project.recording!, portraitEffects: { ...project.recording!.portraitEffects!, skinSmoothing } } })} display={`${Math.round(project.recording.portraitEffects.skinSmoothing * 100)}%`}/><p className="setting-explanation">Optional MediaPipe person mask. Background blur and low-radius skin smoothing affect edited preview and export; your native take stays untouched.</p>{state.portraitStatus.status !== 'idle' && <p className={cn('inline-warning', state.portraitStatus.status === 'ready' && 'portrait-ready')} role="status">{state.portraitStatus.detail}</p>}</>}</>}
   </div></details>
   <div className="property-footer"><ShieldCheck size={12}/>Your edit stays in this tab.</div>
   </motion.div></AnimatePresence>
 </div>;
}
function TranscriptPhrase({ phrase, active, onSeek, onCommit }: {
    phrase: Phrase;
    active: boolean;
    onSeek: () => void;
    onCommit: (text: string) => void;
}) {
    const original = phrase.words.map(w => w.text).join(' '), [text, setText] = useState(original), [editing, setEditing] = useState(false), cancelCommit = useRef(false);
    useEffect(() => setText(original), [original]);
    return <div className={cn('transcript-phrase', active && 'active', editing && 'editing')}><button className="phrase-time mono" onClick={onSeek} aria-label={`Preview caption at ${timecode(phrase.start)}`}><Play size={9}/>{timecode(phrase.start)}</button><textarea aria-label={`Caption phrase at ${timecode(phrase.start)}`} title="Press Enter to save. Press Escape to cancel." rows={2} maxLength={500} value={text} onChange={e => setText(e.target.value)} onFocus={() => setEditing(true)} onBlur={() => {
            if (!cancelCommit.current && text !== original)
                onCommit(text);
            cancelCommit.current = false;
            setEditing(false);
        }} onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
                cancelCommit.current = true;
                setText(original);
                e.currentTarget.blur();
            }
        }}/></div>;
}
