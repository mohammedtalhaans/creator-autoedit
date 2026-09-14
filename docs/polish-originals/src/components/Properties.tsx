import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Captions, AudioLines, ScanFace, ArrowUpRight, RotateCcw, SlidersHorizontal, Check, Play, AlignLeft, AlignCenter, AlignRight, Volume2, Mic, ShieldCheck, ChevronDown } from 'lucide-react';
import { studio, useStudio } from '../app/store';
import type { Project, Module, CaptionConfig, FramingConfig, Phrase, CaptionPreset } from '../types/project';
import { EditMap } from '../features/edit-map';
import { decisionsFor } from '../features/silence';
import { captionPresets, groupWords, correctPhrase } from '../features/captions';
import { NumberTicker } from './magic/signal';
import { Button, Slider, Switch, Segmented, Modal } from './ui/primitives';
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
    const [advanced, setAdvanced] = useState(false);
    useEffect(() => setAdvanced(false), [module]);
    const captions = (patch: Partial<CaptionConfig>) => studio.patch({ captions: { ...project.captions, ...patch } });
    const frame = (patch: Partial<FramingConfig>) => studio.setFraming(patch);
    const cuts = decisionsFor(project.pauses, project.cutPreset, project.sensitivity, project.overrides);
    const restore = (id: string, enabled: boolean) => studio.patch({ overrides: { ...project.overrides, [id]: enabled } });
    const preset = (name: CaptionPreset) => captions({ ...captionPresets[name], preset: name, enabled: true });
    const activeModule = modules.find(m => m.id === module)!;
    return <div id={`panel-${module}`} role="tabpanel" aria-labelledby={`tab-${module}`} className={cn('properties', `properties-${module}`)}>
  <AnimatePresence mode="wait" initial={false}><motion.div key={module} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .2 }}>
  {module === 'cut' && <><Header number="01" title="Find your flow." description="Keep the thought. Lose the dead air."><Scissors size={14}/></Header>
   <div className="cut-result"><div><span className="eyebrow-small">MADE ROOM FOR</span><div className="cut-number"><NumberTicker value={project.metadata.duration - map.outputDuration}/><span>seconds</span></div></div><span className="cut-result-icon"><Scissors size={20}/></span></div>
   <Segmented label="AutoCut pacing" value={project.cutPreset} onChange={cutPreset => studio.patch({ cutPreset })} items={[{ value: 'natural', label: 'Natural', disabled: !project.metadata.hasAudio }, { value: 'tight', label: 'Tight', disabled: !project.metadata.hasAudio }, { value: 'off', label: 'Off' }]}/>
   <p className="setting-explanation">{project.cutPreset === 'natural' ? 'Conversational pacing, with room to breathe.' : project.cutPreset === 'tight' ? 'A faster rhythm. Less space between thoughts.' : 'Every moment of your original video is kept.'}</p>
   <div className="duration-comparison"><div><span>RAW TAKE</span><NumberTicker value={project.metadata.duration} format={timecode}/></div><ArrowUpRight size={17}/><div><span>YOUR EDIT</span><NumberTicker value={map.outputDuration} format={timecode}/></div></div>
   <div className="section-label"><span>THE PAUSES</span><span className="mono">{cuts.filter(c => c.enabled).length} REMOVED</span></div>
   <div className="cut-list">{cuts.length ? cuts.map((cut, i) => <div className={cn('cut-item', !cut.enabled && 'restored')} key={cut.id}><button className="cut-time" onClick={() => onSeek(Math.max(0, cut.start - .4))} aria-label={`Preview pause ${i + 1}`}><span className="mono cut-index">{String(i + 1).padStart(2, '0')}</span><span><strong className="mono">{timecode(cut.start)}</strong><small>{(cut.end - cut.start).toFixed(1)}s pause</small></span></button><button className="cut-toggle" aria-pressed={cut.enabled} onClick={() => restore(cut.id, !cut.enabled)}>{cut.enabled ? <Scissors size={12}/> : <Check size={12}/>}<span>{cut.enabled ? 'Removed' : 'Kept'}</span></button></div>) : <div className="quiet-state"><AudioLines size={24}/><strong>{project.metadata.hasAudio ? 'No long pauses found' : 'No audio to cut'}</strong><p>{project.metadata.hasAudio ? 'Your take is already moving. Try Tight for shorter pauses.' : 'You can still frame and export this video.'}</p></div>}</div>
  </>}
  {module === 'captions' && <><Header number="02" title="Let the words land." description="Good type. Timed to your voice."><Captions size={14}/></Header>
   <Switch label="Captions" checked={project.captions.enabled} onChange={enabled => captions({ enabled })} disabled={!project.metadata.hasAudio}/>
   <div className="preset-grid">{(Object.keys(captionPresets) as CaptionPreset[]).map(name => <button type="button" className={cn('caption-preset', `preset-${name}`, project.captions.preset === name && 'selected')} key={name} aria-label={`${name} caption style`} aria-pressed={project.captions.preset === name} onClick={() => preset(name)}><span className="preset-sample">Make it <em>count.</em></span><span className="preset-name mono">{name}{project.captions.preset === name && <Check size={12}/>}</span></button>)}</div>
   <div className="section-label"><span>MOVEMENT</span><span className="mono">BURNED INTO EXPORT</span></div>
   <Segmented label="Caption animation" value={project.captions.animation} onChange={animation => captions({ animation })} items={[{ value: 'pop', label: 'Pop' }, { value: 'word', label: 'Word' }, { value: 'smooth', label: 'Smooth' }]}/>
   <div className="section-label"><span>YOUR WORDS</span><span className="mono">{project.words.length} WORDS / EN</span></div>
   {state.tasks.captions.status === 'running' ? <><TaskRow title="Building captions locally" task={state.tasks.captions} compact/><Button variant="ghost" size="small" onClick={() => studio.cancelTask('captions')}>Cancel captions</Button></> : project.words.length ? <div className="transcript-editor">{groupWords(project.words, 6, 48).map(phrase => <TranscriptPhrase key={phrase.id} phrase={phrase} active={sourceTime >= phrase.start && sourceTime < phrase.end} onSeek={() => onSeek(phrase.start)} onCommit={text => studio.patch({ words: correctPhrase(project.words, phrase.words.map(w => w.id), text) })}/>)}</div> : <div className="quiet-state"><Captions size={25}/><strong>{state.tasks.captions.status === 'error' ? 'Captions need another try' : 'Your voice, in words.'}</strong><p>{state.tasks.captions.status === 'error' ? state.tasks.captions.detail : 'English speech recognition runs on your device. The first use downloads a speech model.'}</p><Button onClick={() => void studio.transcribe()} disabled={!project.metadata.hasAudio || state.tasks.audio.status !== 'done'}><RotateCcw size={14}/>{state.tasks.captions.status === 'error' ? 'Retry captions' : 'Generate captions'}</Button></div>}
   {!!project.words.length && <p className="setting-explanation">Click a phrase to correct it. Original word timing is preserved when possible.</p>}
  </>}
  {module === 'audio' && <><Header number="03" title="A clearer you." description="Less room. More voice. Still natural."><AudioLines size={15}/></Header>
   <div className={cn('audio-instrument', project.audio.enabled && !voiceRaw && 'enhanced')}><div className="instrument-top"><span className="mono">{project.audio.enabled && !voiceRaw ? 'ENHANCED SIGNAL' : 'SOURCE SIGNAL'}</span><Volume2 size={14}/></div><div className="level-meter" role="meter" aria-label="Live voice level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, 20 * Math.log10(Math.max(.001, level)))}>{Array.from({ length: 25 }, (_, i) => <i key={i} className={cn(i > 21 && 'meter-peak', i < Math.max(0, (20 * Math.log10(Math.max(.001, level)) + 60) / 60 * 25) && 'lit')}/>)}</div><div className="meter-ruler mono"><span>−60</span><span>−24</span><span>−12</span><span>0 dB</span></div><div className="instrument-values"><div><span>VOICE LEVEL</span><strong className="mono">{project.audioStats && project.audio.enabled && !voiceRaw ? project.audioStats.rmsDb.toFixed(1) : (project.sourceAudioStats?.rmsDb ?? -90).toFixed(1)}<small> dB</small></strong></div><div><span>PROCESSING</span><strong>{project.audio.enabled ? 'Voice Enhance' : 'Original'}</strong></div></div></div>
   <Switch label="Voice Enhance" description="Gentle filtering, compression & level balance" checked={project.audio.enabled} onChange={enabled => studio.setAudio({ enabled })} disabled={!project.metadata.hasAudio}/>
   <div className="section-label"><span>NOISE REDUCTION</span><span className="mono">LOCAL RNNOISE</span></div>
   <Segmented label="Noise reduction strength" value={project.audio.noise} onChange={noise => studio.setAudio({ noise })} items={[{ value: 'off', label: 'Off', disabled: !project.metadata.hasAudio || !project.audio.enabled }, { value: 'light', label: 'Light', disabled: !project.metadata.hasAudio || !project.audio.enabled }, { value: 'strong', label: 'Strong', disabled: !project.metadata.hasAudio || !project.audio.enabled }]}/>
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
  <Button className="advanced-trigger" variant="ghost" onClick={() => setAdvanced(true)}><SlidersHorizontal size={15}/>{module === 'captions' ? 'Type, colour & placement' : 'Fine-tune'}<ChevronDown size={14}/></Button>
  <div className="property-footer"><ShieldCheck size={12}/>Your edit stays in this tab.</div>
  </motion.div></AnimatePresence>
  <Modal open={advanced} onOpenChange={setAdvanced} title={`${activeModule.label} · fine-tune`} description="A little more control, when you need it." sheet>
   {module === 'cut' && <><Slider label="Pause sensitivity" value={project.sensitivity} onChange={sensitivity => studio.patch({ sensitivity })} display={project.sensitivity < .35 ? 'Relaxed' : project.sensitivity > .65 ? 'Sensitive' : 'Balanced'}/><p className="setting-explanation">Higher sensitivity includes shorter pauses. Speech-edge padding stays protected.</p><Switch label="Dynamic punch · Low" description="An occasional 3.5% push-in around a jump cut" checked={project.framing.punch} onChange={punch => frame({ punch })}/><Button onClick={() => studio.patch({ overrides: {}, sensitivity: .5 })}><RotateCcw size={14}/>Reset cut adjustments</Button></>}
   {module === 'captions' && <><div className="field-label"><label htmlFor="caption-font">Typeface</label></div><select id="caption-font" className="select" value={project.captions.font} onChange={e => captions({ font: e.target.value as CaptionConfig['font'] })}><option value="studio">Studio Grotesk</option><option value="condensed">Condensed</option><option value="mono">Technical Mono</option></select>
    <Slider label="Size" value={project.captions.size} min={.5} max={1.6} onChange={size => captions({ size })} display={`${Math.round(project.captions.size * 100)}%`}/>
    <Slider label="Vertical position" value={project.captions.y} min={.12} max={.84} onChange={y => { captions({ y }); onGuides(); }} display={`${Math.round(project.captions.y * 100)}%`}/>
    <Segmented label="Text alignment" value={project.captions.align} onChange={align => captions({ align })} items={[{ value: 'left', label: <><AlignLeft size={16}/><span className="sr-only">Left</span></> }, { value: 'center', label: <><AlignCenter size={16}/><span className="sr-only">Center</span></> }, { value: 'right', label: <><AlignRight size={16}/><span className="sr-only">Right</span></> }]}/>
    <div className="colour-fields"><label>Text<input type="color" value={project.captions.color} onChange={e => captions({ color: e.target.value })}/></label><label>Accent<input type="color" value={project.captions.accent} onChange={e => captions({ accent: e.target.value })}/></label></div>
    <Switch label="Highlight active word" checked={project.captions.highlight} onChange={highlight => captions({ highlight })}/><Switch label="Uppercase" checked={project.captions.uppercase} onChange={uppercase => captions({ uppercase })}/><Switch label="Text shadow" checked={project.captions.shadow} onChange={shadow => captions({ shadow })}/><Switch label="Backing plate" checked={project.captions.background} onChange={background => captions({ background })}/>
    {project.captions.background && <Slider label="Plate opacity" value={project.captions.opacity} onChange={opacity => captions({ opacity })} display={`${Math.round(project.captions.opacity * 100)}%`}/>}
    <details className="advanced-details"><summary>Social safe zones</summary><p className="setting-explanation">Guides are editable and never included in your export. Social interfaces can change.</p>{(['top', 'bottom', 'left', 'right'] as const).map(side => <Slider key={side} label={`${side[0].toUpperCase() + side.slice(1)} inset`} value={project.captions.safe[side]} min={0} max={.32} onChange={v => { captions({ safe: { ...project.captions.safe, [side]: v } }); onGuides(); }} display={`${Math.round(project.captions.safe[side] * 100)}%`}/>)}</details>
   </>}
   {module === 'audio' && <><Slider label="Output volume" value={project.audio.volume} min={0} max={1} onChange={volume => studio.setAudio({ volume })} display={`${Math.round(project.audio.volume * 100)}%`}/><div className="signal-chain"><span>75 Hz high-pass</span><i>→</i><span>Presence</span><i>→</i><span>Gentle compression</span><i>→</i><span>Level balance</span><i>→</i><span>−1 dB peak ceiling</span></div><p className="setting-explanation">Processing is designed for one speaking voice. It is not music mastering or studio reconstruction.</p></>}
   {module === 'frame' && <><Slider label="Horizontal centre" value={project.framing.x} onChange={x => frame({ x, mode: 'fill' })} display={`${Math.round(project.framing.x * 100)}%`}/><Slider label="Vertical centre" value={project.framing.y} onChange={y => frame({ y, mode: 'fill' })} display={`${Math.round(project.framing.y * 100)}%`}/><Switch label="Dynamic punch · Low" description="Subtle variety on occasional jump cuts" checked={project.framing.punch} onChange={punch => frame({ punch })}/></>}
  </Modal>
 </div>;
}
function TranscriptPhrase({ phrase, active, onSeek, onCommit }: {
    phrase: Phrase;
    active: boolean;
    onSeek: () => void;
    onCommit: (text: string) => void;
}) {
    const original = phrase.words.map(w => w.text).join(' '), [text, setText] = useState(original), cancelCommit = useRef(false);
    useEffect(() => setText(original), [original]);
    return <div className={cn('transcript-phrase', active && 'active')}><button className="phrase-time mono" onClick={onSeek} aria-label={`Play caption at ${timecode(phrase.start)}`}><Play size={9}/>{timecode(phrase.start)}</button><textarea aria-label={`Caption phrase at ${timecode(phrase.start)}`} rows={2} maxLength={500} value={text} onChange={e => setText(e.target.value)} onBlur={() => {
            if (!cancelCommit.current && text !== original)
                onCommit(text);
            cancelCommit.current = false;
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
