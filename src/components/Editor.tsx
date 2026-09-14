import { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause, SkipBack, Maximize2, Minimize2, Eye, Scan, ArrowRight, Plus, Info, Check, Loader2, Sparkles } from 'lucide-react';
import { studio, useStudio } from '../app/store';
import type { Project, FramingConfig, CaptionConfig } from '../types/project';
import { EditMap } from '../features/edit-map';
import { projectCuts } from '../features/silence';
import { dimensions } from '../features/framing';
import { Preview, type PreviewHandle } from './player/Preview';
import { Timeline } from './timeline/Timeline';
import { Properties, ModuleRail, modules } from './Properties';
import { Brand } from './Brand';
import { Button, IconButton, Modal, Segmented } from './ui/primitives';
import { GlowSurface } from './aceternity/file-upload';
import { NumberTicker } from './magic/signal';
import { timecode, bytes, cn } from '../lib/utils';
function useMobile() { const [mobile, setMobile] = useState(() => matchMedia('(max-width: 820px)').matches); useEffect(() => { const media = matchMedia('(max-width: 820px)'), change = () => setMobile(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []); return mobile; }
export function Editor({ project, onAbout, onNew }: {
    project: Project;
    onAbout: () => void;
    onNew: () => void;
}) {
    const state = useStudio(), player = useRef<PreviewHandle>(null), mobile = useMobile();
    const [transport, setTransport] = useState({ time: 0, playing: false, level: 0 });
    const [compare, setCompare] = useState<'raw' | 'edited'>('edited'), [holding, setHolding] = useState(false), [voiceRaw, setVoiceRaw] = useState(false), [guides, setGuides] = useState(false), [fullscreen, setFullscreen] = useState(false), [exportOpen, setExportOpen] = useState(false), [info, setInfo] = useState(false);
    const raw = compare === 'raw' || holding;
    const cuts = useMemo(() => projectCuts(project), [project]);
    const map = useMemo(() => EditMap.fromCuts(project.metadata.duration, cuts), [project.metadata.duration, cuts]);
    const busy = Object.entries(state.tasks).some(([key, t]) => key !== 'export' && t.status === 'running');
    const outputTime = map.sourceTimeToOutputTime(transport.time), d = dimensions(project.framing.ratio, project.exportConfig.quality, project.metadata);
    const patchFrame = (patch: Partial<FramingConfig>) => studio.setFraming(patch);
    const patchCaptions = (patch: Partial<CaptionConfig>) => studio.patch({ captions: { ...project.captions, ...patch } });
    const restore = (id: string, enabled: boolean) => studio.patch({ overrides: { ...project.overrides, [id]: enabled } });
    const showGuides = () => setGuides(true);
    useEffect(() => {
        const keyboard = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).closest('input,textarea,select,button,[role="dialog"]'))
                return;
            if (e.key === ' ' || e.key === 'k') {
                e.preventDefault();
                player.current?.toggle();
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (raw)
                    player.current?.seekSource(transport.time + 3);
                else
                    player.current?.seek(outputTime + 3);
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (raw)
                    player.current?.seekSource(transport.time - 3);
                else
                    player.current?.seek(outputTime - 3);
            }
            if (e.key === 'Escape')
                setFullscreen(false);
        };
        document.addEventListener('keydown', keyboard);
        return () => document.removeEventListener('keydown', keyboard);
    }, [outputTime, raw, transport.time]);
    useEffect(() => {
        if (fullscreen) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [fullscreen]);
    const props = { project, map, module: state.module, sourceTime: transport.time, level: transport.level, voiceRaw, onVoiceRaw: setVoiceRaw, onSeek: (time: number) => player.current?.seekSource(time), onGuides: showGuides };
    return <div className="editor-shell"><header className="editor-header"><div className="editor-brand"><Brand compact onClick={onNew}/><span className="header-divider"/><Button variant="ghost" size="small" onClick={onNew}><Plus size={14}/><span className="hide-small">New take</span></Button></div><button className="project-name" title={project.source.name} aria-label={`Source video: ${project.source.name}`} onClick={() => setInfo(true)}><span>{project.source.name.replace(/\.[^.]+$/, '')}</span><Info size={13}/></button><div className="editor-header-actions"><span className="local-label"><i />ON DEVICE</span><IconButton label="About and privacy" onClick={onAbout}><Info size={17}/></IconButton><Button variant="primary" size="small" title={busy ? 'Finish preparing edits before exporting' : undefined} onClick={() => { player.current?.pause(); setExportOpen(true); }} disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <ArrowRight size={16}/>}<span>{busy ? 'Preparing edits' : 'Export Reel'}</span></Button></div></header>
  <div className="workspace-topline"><span className="mono"><i className="led"/> YOUR PERSONAL POST-PRODUCTION STUDIO</span><Button variant="ghost" size="small" onClick={studio.autoEdit} disabled={busy}><Sparkles size={14}/>AutoEdit<Check size={12}/></Button></div>
  <main className="workspace"><GlowSurface className={cn('player-panel', fullscreen && 'fullscreen-preview')}><div className="player-toolbar"><span className="mono">THE MONITOR <span className="slash">/</span> {raw ? 'ORIGINAL TAKE' : 'YOUR EDIT'}</span><div><IconButton label={guides ? 'Hide social safe zones' : 'Show social safe zones'} onClick={() => setGuides(!guides)} aria-pressed={guides}><Scan size={15}/></IconButton><IconButton label={fullscreen ? 'Exit immersive preview' : 'Expand preview'} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton></div></div>
   <div className="monitor-center"><div className="monitor-side-data mono"><span>{d.width} × {d.height}</span><span>30 FPS OUTPUT</span><span>{project.framing.mode === 'auto' ? 'SUBJECT LOCKED' : project.framing.mode.toUpperCase() + ' FRAME'}</span></div><Preview ref={player} project={project} map={map} audioUrl={state.audioUrl} raw={raw} voiceRaw={voiceRaw} module={state.module} guides={guides} onTime={(time, playing, level) => setTransport({ time, playing, level })} onFrameChange={patchFrame} onCaptionChange={patchCaptions} onInteract={showGuides}/><span className="monitor-index mono">TAKE 001</span></div>
   <div className="player-bottom"><div className="preview-comparison"><Segmented label="Compare original and edited video" value={compare} onChange={setCompare} items={[{ value: 'raw', label: 'Raw' }, { value: 'edited', label: 'Edited' }]}/><button className="hold-compare" aria-pressed={holding} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setHolding(true); }} onPointerUp={() => setHolding(false)} onPointerCancel={() => setHolding(false)} onLostPointerCapture={() => setHolding(false)} onKeyDown={e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setHolding(true);
            }
        }} onKeyUp={() => setHolding(false)} onBlur={() => setHolding(false)} aria-label="Hold to compare with original video"><Eye size={13}/><span>Hold original</span></button></div>
   <div className="transport"><div className="transport-buttons"><IconButton label="Back to start" onClick={() => raw ? player.current?.seekSource(0) : player.current?.seek(0)}><SkipBack size={16}/></IconButton><button className="play-button" onClick={() => player.current?.toggle()} aria-label={transport.playing ? 'Pause video' : 'Play video'}>{transport.playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button></div><div className="timecode"><span className="mono">{timecode(raw ? transport.time : outputTime, true)}</span><span className="mono"> / {timecode(raw ? project.metadata.duration : map.outputDuration)}</span></div><span className="preview-status mono" role="status" aria-live="polite">{raw ? 'RAW TAKE' : project.audio.enabled && !voiceRaw && state.audioUrl ? 'VOICE ENHANCED' : 'ORIGINAL VOICE'}</span></div>
   </div></GlowSurface>
   {!mobile && <aside className="property-panel"><ModuleRail active={state.module} onChange={studio.module}/><Properties {...props}/></aside>}
   <Timeline project={project} map={map} cuts={cuts} time={transport.time} raw={raw} onSeek={t => raw ? player.current?.seekSource(t) : player.current?.seek(t)} onRestore={restore}/>
  </main>
  <footer className="editor-footer"><span><i />LOCAL SESSION · NOT SAVED AFTER REFRESH</span><span className="mono">{bytes(project.source.file.size)} SOURCE<span className="slash">/</span>{project.metadata.width} × {project.metadata.height}</span><span className="keyboard-hint"><kbd>SPACE</kbd> PLAY / PAUSE</span></footer>
   {mobile && <><ModuleRail className="mobile-rail" active={state.module} onChange={studio.module}/><section className="mobile-properties-inline" aria-label={`${modules.find(m => m.id === state.module)!.label} controls`}><Properties {...props}/></section></>}
  <Modal open={info} onOpenChange={setInfo} title="Your source video" description="Read directly from the file. Never uploaded."><dl className="metadata-list"><dt>File</dt><dd>{project.source.name}</dd><dt>Duration</dt><dd>{timecode(project.metadata.duration, true)}</dd><dt>Dimensions</dt><dd>{project.metadata.width} × {project.metadata.height}</dd><dt>Video codec</dt><dd>{project.metadata.videoCodec.toUpperCase()}</dd><dt>Audio codec</dt><dd>{project.metadata.audioCodec?.toUpperCase() ?? 'No audio'}</dd><dt>Frame rate</dt><dd>{project.metadata.fps ? `${project.metadata.fps.toFixed(2)} fps (estimated)` : 'Not reported'}</dd><dt>File size</dt><dd>{bytes(project.metadata.size)}</dd></dl></Modal>
  <Modal open={exportOpen} onOpenChange={setExportOpen} title="Make it a Reel." description="A real MP4. Rendered here, on your device."><div className="export-summary"><div><span className="mono">YOUR FINISHED VIDEO</span><strong><NumberTicker value={map.outputDuration} format={timecode}/></strong></div><span className="export-format">MP4<ArrowUpRightIcon /></span></div>
   <div className="quality-options">{([720, 1080] as const).map(q => <button key={q} className={cn(project.exportConfig.quality === q && 'selected')} disabled={q === 1080 && !state.capabilities?.supported1080} onClick={() => studio.patch({ exportConfig: { quality: q, fps: 30 } })}><div><strong>{q === 720 ? 'Standard' : 'High'}</strong><span>{q}p{q === 720 && state.capabilities?.constrained ? ' · Recommended' : ''}</span></div>{project.exportConfig.quality === q ? <Check size={18}/> : <span className="radio-ring"/>}</button>)}</div>
   <div className="export-specs mono"><span>{d.width} × {d.height}</span><span>H.264</span><span>{project.metadata.hasAudio ? 'AAC · MONO' : 'NO AUDIO'}</span><span>30 FPS</span></div><p className="setting-explanation">Estimated size: ~{bytes(map.outputDuration * ((project.exportConfig.quality === 1080 ? 5000000 : 2400000) + (project.metadata.hasAudio ? 128000 : 0)) / 8)}. Actual size depends on your footage.</p>
   {!project.words.length && project.captions.enabled && <p className="inline-warning">No caption words are available. This export will not contain captions. Return to Captions to generate or retry them.</p>}
   <div className="export-privacy"><Check size={16}/><p>Keep this tab open while exporting. Leaving the app can pause processing, especially on a phone.</p></div>
   <Button variant="primary" size="large" className="full-width" disabled={busy} onClick={() => { setExportOpen(false); player.current?.pause(); void studio.export(); }}>Export Reel<ArrowRight size={18}/></Button>
  </Modal>
 </div>;
}
function ArrowUpRightIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 18L18 6M6 6h12v12"/></svg>; }
