import { useMemo, useState, type ReactNode } from 'react';
import { Scissors, Captions, ScanFace, RotateCcw, Play, AlignLeft, AlignCenter, AlignRight, Check, Plus, Minus } from 'lucide-react';
import { studio } from '../app/store';
import type { Project, Module, CaptionConfig, FramingConfig, Phrase, CaptionPreset } from '../types/project';
import { EditMap } from '../features/edit-map';
import { projectCuts, resolveCutHandles } from '../features/silence';
import { captionPresets, captionPresetLabels, groupWords, correctPhrase } from '../features/captions';
import { NumberTicker } from './magic/signal';
import { Alert, Badge, Button, Card, Segmented, Slider, Tabs, TabsList, TabsTrigger } from './ui/primitives';
import { timecode, cn } from '../lib/utils';

export const modules: { id: Module; label: string; icon: typeof Scissors; number: string }[] = [
    { id: 'cut', label: 'Cut', icon: Scissors, number: '01' },
    { id: 'frame', label: 'Frame', icon: ScanFace, number: '02' }
];

export function ModuleRail({ active, onChange, className }: { active: Module; onChange: (module: Module) => void; className?: string }) {
    return <Tabs value={active} onValueChange={value => { if (modules.some(module => module.id === value)) onChange(value as Module); }} className="module-tabs"><TabsList className={cn('module-rail', className)} aria-label="Editing steps">
        {modules.map(module => <TabsTrigger key={module.id} value={module.id} id={`tab-${module.id}`} aria-controls={`panel-${module.id}`} className={cn(active === module.id && 'active')}><module.icon size={17} /><span>{module.label}</span></TabsTrigger>)}
    </TabsList></Tabs>;
}

function Header({ number, title, description, children }: { number: string; title: string; description: string; children?: ReactNode }) {
    return <header className="property-heading"><div className="property-kicker"><span>STEP {number}</span>{children}</div><h2>{title}</h2><p>{description}</p></header>;
}

function CutCard({ project, index, cut, onSeek }: { project: Project; index: number; cut: { id: string; start: number; end: number; enabled: boolean }; onSeek: (time: number) => void }) {
    const adjustment = project.cutAdjustments?.[cut.id] ?? { startDelta: 0, endDelta: 0 };
    const removed = Math.max(0, cut.end - cut.start);
    const pause = project.pauses.find(candidate => candidate.id === cut.id);
    const retainedBefore = pause ? Math.max(0, cut.start - pause.start) : 0;
    const retainedAfter = pause ? Math.max(0, pause.end - cut.end) : 0;
    const setAdjustment = (patch: Partial<typeof adjustment>) => studio.setCutAdjustments(cut.id, patch);
    return <Card className={cn('cut-card', !cut.enabled && 'is-kept')}>
        <div className="cut-card-top">
            <button type="button" className="cut-time" onClick={() => onSeek(Math.max(0, cut.start - .4))} aria-label={`Preview cut ${index + 1}`}><Badge variant="outline">{String(index + 1).padStart(2, '0')}</Badge><span><strong className="mono">{timecode(cut.start, true)}</strong><small>{removed.toFixed(2)}s removed</small></span></button>
            <Button size="small" variant="outline" onClick={() => onSeek(Math.max(0, cut.start - .4))}><Play size={14} />Preview</Button>
            <Button size="small" variant={cut.enabled ? 'secondary' : 'default'} aria-pressed={cut.enabled} onClick={() => studio.patch({ overrides: { ...project.overrides, [cut.id]: !cut.enabled } })}>{cut.enabled ? <><Scissors size={14} />Remove</> : <><Check size={14} />Keep</>}</Button>
        </div>
        <div className="cut-card-adjustments">
            <div className="cut-result-duration"><span className="cut-adjustment-value mono">{timecode(Math.max(0, removed), true)}</span><small>resulting cut</small></div>
            <div className="cut-stepper"><div><strong>Before cut</strong><small>Retained after previous sound · {Math.round(retainedBefore * 1000)}ms</small></div><div className="cut-stepper-buttons"><Button size="icon" variant="outline" aria-label="Keep less before" title="Keep less before" onClick={() => setAdjustment({ startDelta: adjustment.startDelta - .05 })}><Minus size={16} /></Button><Button size="icon" variant="outline" aria-label="Keep more before" title="Keep more before" onClick={() => setAdjustment({ startDelta: adjustment.startDelta + .05 })}><Plus size={16} /></Button></div></div>
            <div className="cut-stepper"><div><strong>After cut</strong><small>Retained before next sound · {Math.round(retainedAfter * 1000)}ms</small></div><div className="cut-stepper-buttons"><Button size="icon" variant="outline" aria-label="Keep less after" title="Keep less after" onClick={() => setAdjustment({ endDelta: adjustment.endDelta + .05 })}><Minus size={16} /></Button><Button size="icon" variant="outline" aria-label="Keep more after" title="Keep more after" onClick={() => setAdjustment({ endDelta: adjustment.endDelta - .05 })}><Plus size={16} /></Button></div></div>
        </div>
        {(adjustment.startDelta !== 0 || adjustment.endDelta !== 0) && <div className="cut-adjustment-note"><span>Adjusted {adjustment.startDelta > 0 ? `+${Math.round(adjustment.startDelta * 1000)}ms before` : ''}{adjustment.startDelta !== 0 && adjustment.endDelta !== 0 ? ' · ' : ''}{adjustment.endDelta < 0 ? `+${Math.round(-adjustment.endDelta * 1000)}ms after` : ''}</span><Button size="small" variant="ghost" onClick={() => studio.setCutAdjustments(cut.id, { startDelta: 0, endDelta: 0 })}>Reset this cut</Button></div>}
    </Card>;
}

export function Properties({ project, map, module, sourceTime, onSeek }: {
    project: Project;
    map: EditMap;
    module: Module;
    sourceTime: number;
    level?: number;
    voiceRaw?: boolean;
    onVoiceRaw?: (value: boolean) => void;
    onSeek: (time: number) => void;
    onGuides?: () => void;
}) {
    const cuts = useMemo(() => projectCuts(project), [project]);
    const handles = resolveCutHandles(project.cutConfig, project.cutPreset);
    const caption = (patch: Partial<CaptionConfig>) => studio.patch({ captions: { ...project.captions, ...patch } });
    const frame = (patch: Partial<FramingConfig>) => studio.setFraming(patch);
    const preset = (name: CaptionPreset) => caption({ ...captionPresets[name], preset: name, enabled: true });
    return <section id={`panel-${module}`} role="tabpanel" aria-labelledby={`tab-${module}`} className={cn('properties', `properties-${module}`)}>
        {module === 'cut' && <>
            <Header number="01" title="Review the pauses." description="AutoCut follows sound energy and keeps a conservative handle around every boundary."><Scissors size={15} /></Header>
            <Card className="cut-result"><div><span className="eyebrow-small">ROOM REMOVED</span><div className="cut-number"><NumberTicker value={Math.max(0, project.metadata.duration - map.outputDuration)} /><span>seconds</span></div></div><Badge variant="secondary">{cuts.filter(cut => cut.enabled).length} cuts</Badge></Card>
            <Segmented label="AutoCut pacing" value={project.cutPreset} onChange={cutPreset => studio.setCutPreset(cutPreset)} items={[{ value: 'natural', label: 'Natural', disabled: !project.metadata.hasAudio, disabledReason: 'Natural pacing needs an audio track' }, { value: 'tight', label: 'Tight', disabled: !project.metadata.hasAudio, disabledReason: 'Tight pacing needs an audio track' }, { value: 'jump', label: 'Jump', disabled: !project.metadata.hasAudio, disabledReason: 'Jump cuts need an audio track' }, { value: 'off', label: 'Off' }]} />
            <p className="setting-explanation">{project.cutPreset === 'natural' ? 'Conversational pacing with more room to breathe.' : project.cutPreset === 'tight' ? 'A quicker rhythm with a safe lead-in before the next sound.' : project.cutPreset === 'jump' ? 'Short gaps are trimmed while preserving a small seam.' : 'Every moment of the source is kept.'}</p>
            <Alert title="Sound-aware AutoCut">The local gate measures energy only. It cannot tell speech from music or other sounds.</Alert>
            {project.metadata.hasAudio && <>
                <div className="section-label"><span>GLOBAL HANDLES</span><span className="mono">BOUND TO EACH PAUSE</span></div>
                <Slider label="Keep after previous sound" value={handles.afterSpeechPadding} min={0} max={.4} step={.01} display={`${Math.round(handles.afterSpeechPadding * 1000)}ms`} onChange={value => studio.setCutConfig({ afterSpeechPadding: value })} />
                <Slider label="Keep before next sound" value={handles.beforeSpeechPadding} min={0} max={.4} step={.01} display={`${Math.round(handles.beforeSpeechPadding * 1000)}ms`} onChange={value => studio.setCutConfig({ beforeSpeechPadding: value })} />
                <Slider label="Minimum gap" value={project.cutConfig?.minPause ?? .22} min={.04} max={2} step={.01} display={`${Math.round((project.cutConfig?.minPause ?? .22) * 1000)}ms`} onChange={value => studio.setCutConfig({ minPause: value })} />
            </>}
            <div className="cut-list">{cuts.length ? cuts.map((cut, index) => <CutCard key={cut.id} project={project} index={index} cut={cut} onSeek={onSeek} />) : <div className="quiet-state"><Scissors size={23} /><strong>{project.metadata.hasAudio ? 'No sound gaps found' : 'No audio to cut'}</strong><p>{project.metadata.hasAudio ? 'The source is already continuous at this threshold.' : 'Framing and export are still available.'}</p></div>}{project.metadata.hasAudio && (project.waveform.activityDb ?? project.waveform.speechDb ?? -90) <= -65 && <Alert className="all-silent-state" title="No sound detected">The original take stays available. Review it before trimming.</Alert>}</div>
            <Button variant="outline" className="full-width" onClick={studio.resetCuts}><RotateCcw size={15} />Reset cuts</Button>
        </>}
        {module === 'captions' && <>
            <Header number="02" title="Add captions manually." description="Captions appear only when you provide timed words; this editor never generates a transcript."><Captions size={15} /></Header>
            {!project.words.length ? <Alert title="No timed caption text">Add timestamped caption words through the project data, then return here to style them.</Alert> : <>
                <div className="transcript-editor">{groupWords(project.words, 6, 48).map(phrase => <TranscriptPhrase key={phrase.id} phrase={phrase} active={sourceTime >= phrase.start && sourceTime < phrase.end} onSeek={() => onSeek(phrase.start)} onCommit={text => studio.setManualWords(correctPhrase(project.words, phrase.words.map(word => word.id), text))} />)}</div>
                <Button variant={project.captions.enabled ? 'secondary' : 'default'} onClick={() => caption({ enabled: !project.captions.enabled })}>{project.captions.enabled ? 'Hide captions' : 'Show captions'}</Button>
                <div className="preset-grid">{(Object.keys(captionPresets) as CaptionPreset[]).map(name => <button key={name} type="button" className={cn('preset-card', project.captions.preset === name && 'selected')} onClick={() => preset(name)}><span className="preset-name">{name}</span><span className="preset-sample">Aa</span><small>{captionPresetLabels[name]}</small></button>)}</div>
                <div className="caption-controls"><Slider label="Caption size" value={project.captions.size} min={.5} max={1.6} step={.01} display={`${Math.round(project.captions.size * 100)}%`} onChange={size => caption({ size })} /><Slider label="Caption position" value={project.captions.y} min={.12} max={.86} step={.01} display={`${Math.round(project.captions.y * 100)}%`} onChange={y => caption({ y })} /><Segmented label="Caption alignment" value={project.captions.align} onChange={align => caption({ align })} items={[{ value: 'left', label: <AlignLeft size={15} /> }, { value: 'center', label: <AlignCenter size={15} /> }, { value: 'right', label: <AlignRight size={15} /> }]} /></div>
            </>}
        </>}
        {module === 'frame' && <>
            <Header number="02" title="Set your frame." description="The original source ratio is preserved until you choose another output frame."><ScanFace size={15} /></Header>
            <Segmented label="Output ratio" value={project.framing.ratio} onChange={ratio => frame({ ratio })} items={[{ value: 'original', label: 'Original' }, { value: 'vertical', label: '9:16' }, { value: 'square', label: '1:1' }]} />
            <Slider label="Horizontal centre" value={project.framing.x} onChange={x => frame({ x, mode: 'fill' })} display={`${Math.round(project.framing.x * 100)}%`} />
            <Slider label="Vertical centre" value={project.framing.y} onChange={y => frame({ y, mode: 'fill' })} display={`${Math.round(project.framing.y * 100)}%`} />
            <Slider label="Zoom" value={project.framing.zoom} min={1} max={2.5} step={.01} onChange={zoom => frame({ zoom })} display={`${Math.round(project.framing.zoom * 100)}%`} disabled={project.framing.mode === 'fit'} />
            <Alert title="Manual framing">Drag the preview or use these controls. The recorded display dimensions determine the original aspect ratio.</Alert>
        </>}
    </section>;
}

function TranscriptPhrase({ phrase, active, onSeek, onCommit }: { phrase: Phrase; active: boolean; onSeek: () => void; onCommit: (text: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(phrase.words.map(word => word.text).join(' '));
    return <div className={cn('transcript-phrase', active && 'active', editing && 'editing')}><Button variant="ghost" className="transcript-phrase-seek" onClick={onSeek}><span>{text}</span><small className="mono">{timecode(phrase.start, true)}</small></Button>{editing ? <div className="phrase-edit"><input className="origin-input" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { onCommit(text); setEditing(false); } if (event.key === 'Escape') { setText(phrase.words.map(word => word.text).join(' ')); setEditing(false); } }} autoFocus aria-label="Edit caption text" /><Button size="small" onClick={() => { onCommit(text); setEditing(false); }}>Save</Button></div> : <Button size="small" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}</div>;
}
