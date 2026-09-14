import { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause, SkipBack, Maximize2, Minimize2, Eye, Scan, ArrowRight, ArrowLeft, Plus, Info, Check, Loader2 } from 'lucide-react';
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
import { NumberTicker } from './magic/signal';
import { timecode, bytes, cn } from '../lib/utils';

function useMobile() {
    const [mobile, setMobile] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 820px)').matches);
    useEffect(() => { const media = matchMedia('(max-width: 820px)'), change = () => setMobile(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
    return mobile;
}

export function Editor({ project, onAbout, onNew, onBack }: { project: Project; onAbout: () => void; onNew: () => void; onBack?: () => void }) {
    const state = useStudio();
    const player = useRef<PreviewHandle>(null);
    const mobile = useMobile();
    const [transport, setTransport] = useState({ time: 0, playing: false, level: 0 });
    const [compare, setCompare] = useState<'raw' | 'edited'>('edited');
    const [holding, setHolding] = useState(false);
    const [guides, setGuides] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [info, setInfo] = useState(false);
    const raw = compare === 'raw' || holding;
    const cuts = useMemo(() => projectCuts(project), [project]);
    const map = useMemo(() => EditMap.fromCuts(project.metadata.duration, cuts), [project.metadata.duration, cuts]);
    const busy = state.tasks.audio.status === 'running';
    const outputTime = map.sourceTimeToOutputTime(transport.time);
    const outputDimensions = dimensions(project.framing.ratio, project.exportConfig.quality, project.metadata);
    const patchFrame = (patch: Partial<FramingConfig>) => studio.setFraming(patch);
    const patchCaptions = (patch: Partial<CaptionConfig>) => studio.patch({ captions: { ...project.captions, ...patch } });
    const restore = (id: string, enabled: boolean) => studio.patch({ overrides: { ...project.overrides, [id]: enabled } });
    const goBack = () => { player.current?.pause(); if (onBack) onBack(); else studio.cancel(); };
    const continueEdit = () => {
        const currentIndex = Math.max(0, modules.findIndex(module => module.id === state.module));
        const next = modules[currentIndex + 1];
        if (next) studio.module(next.id);
        else setExportOpen(true);
    };
    useEffect(() => {
        const keyboard = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement).closest('input,textarea,select,button,[role="dialog"]')) return;
            if (event.key === ' ' || event.key === 'k') { event.preventDefault(); player.current?.toggle(); }
            if (event.key === 'ArrowRight') { event.preventDefault(); if (raw) player.current?.seekSource(transport.time + 3); else player.current?.seek(outputTime + 3); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); if (raw) player.current?.seekSource(transport.time - 3); else player.current?.seek(outputTime - 3); }
            if (event.key === 'Escape') setFullscreen(false);
        };
        document.addEventListener('keydown', keyboard);
        return () => document.removeEventListener('keydown', keyboard);
    }, [outputTime, raw, transport.time]);
    useEffect(() => { if (fullscreen) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; } }, [fullscreen]);
    return <div className="editor-shell">
        <header className="editor-header"><div className="editor-brand"><Button variant="ghost" size="small" onClick={goBack}><ArrowLeft size={15} /><span>Back</span></Button><Brand compact onClick={onNew} /><span className="header-divider" /><Button variant="ghost" size="small" onClick={onNew}><Plus size={14} /><span className="hide-small">New take</span></Button></div><Button variant="ghost" size="small" className="project-name" title={project.source.name} aria-label={`Source video: ${project.source.name}`} onClick={() => setInfo(true)}><span>{project.source.name.replace(/\.[^.]+$/, '')}</span><Info size={13} /></Button><div className="editor-header-actions"><Button variant="ghost" size="small" onClick={onAbout}>About</Button><IconButton label="About and privacy" onClick={onAbout}><Info size={17} /></IconButton><Button variant="default" size="small" title={busy ? 'Finish reading the audio first' : undefined} onClick={() => { player.current?.pause(); setExportOpen(true); }} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <ArrowRight size={16} />}<span>{busy ? 'Preparing' : 'Export'}</span></Button></div></header>
        <div className="workspace-topline"><span className="mono"><i className="led" /> EDIT YOUR TAKE</span><span className="workspace-step">{modules.findIndex(module => module.id === state.module) + 1} / {modules.length}</span></div>
        <main className="workspace"><div className={cn('player-panel origin-card', fullscreen && 'fullscreen-preview')}><div className="player-toolbar"><span className="mono">PREVIEW <span className="slash">/</span> {raw ? 'ORIGINAL' : 'EDITED'}</span><div><IconButton label={guides ? 'Hide safe area' : 'Show safe area'} onClick={() => setGuides(!guides)} aria-pressed={guides}><Scan size={15} /></IconButton><IconButton label={fullscreen ? 'Exit full preview' : 'Expand preview'} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</IconButton></div></div><div className="monitor-center"><div className="monitor-side-data mono"><span>{outputDimensions.width} × {outputDimensions.height}</span><span>{Math.round(project.metadata.fps || 30)} FPS</span><span>{project.framing.ratio === 'original' ? 'ORIGINAL FRAME' : `${project.framing.ratio.toUpperCase()} FRAME`}</span></div><Preview ref={player} project={project} map={map} raw={raw} module={state.module} guides={guides} onTime={(time, playing, level) => setTransport({ time, playing, level })} onFrameChange={patchFrame} onCaptionChange={patchCaptions} onInteract={() => setGuides(true)} /><span className="monitor-index mono">TAKE 001</span></div><div className="player-bottom"><div className="preview-comparison"><Segmented label="Compare original and edited video" value={compare} onChange={setCompare} items={[{ value: 'raw', label: 'Original' }, { value: 'edited', label: 'Edited' }]} /><button className="hold-compare" aria-pressed={holding} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setHolding(true); }} onPointerUp={() => setHolding(false)} onPointerCancel={() => setHolding(false)} onLostPointerCapture={() => setHolding(false)} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setHolding(true); } }} onKeyUp={() => setHolding(false)} onBlur={() => setHolding(false)} aria-label="Hold to compare with original video"><Eye size={13} /><span>Hold original</span></button></div><div className="transport"><div className="transport-buttons"><IconButton label="Back to start" onClick={() => raw ? player.current?.seekSource(0) : player.current?.seek(0)}><SkipBack size={16} /></IconButton><button className="play-button" onClick={() => player.current?.toggle()} aria-label={transport.playing ? 'Pause video' : 'Play video'}>{transport.playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button></div><div className="timecode"><span className="mono">{timecode(raw ? transport.time : outputTime, true)}</span><span className="mono"> / {timecode(raw ? project.metadata.duration : map.outputDuration)}</span></div><span className="preview-status mono" role="status" aria-live="polite">{raw ? 'ORIGINAL TAKE' : 'ORIGINAL AUDIO'}</span></div></div></div>{!mobile && <aside className="property-panel"><ModuleRail active={state.module} onChange={studio.module} /><Properties project={project} map={map} module={state.module} sourceTime={transport.time} onSeek={time => player.current?.seekSource(time)} /></aside>}<Timeline project={project} map={map} cuts={cuts} time={transport.time} raw={raw} onSeek={time => raw ? player.current?.seekSource(time) : player.current?.seek(time)} onRestore={restore} /></main>
        <footer className="editor-footer"><span><i /> LOCAL SESSION</span><span className="mono">{bytes(project.source.file.size)} SOURCE <span className="slash">/</span> {project.metadata.width} × {project.metadata.height}</span><span className="keyboard-hint"><kbd>SPACE</kbd> PLAY / PAUSE</span></footer>
        {mobile && <><section className="mobile-properties-inline" aria-label={`${modules.find(module => module.id === state.module)?.label ?? 'Editing'} controls`}><Properties project={project} map={map} module={state.module} sourceTime={transport.time} onSeek={time => player.current?.seekSource(time)} /></section><div className="mobile-bottom-dock"><ModuleRail className="mobile-rail" active={state.module} onChange={studio.module} /><div className="mobile-editor-actions"><Button variant="outline" onClick={goBack}><ArrowLeft size={16} />Back</Button><Button variant="default" onClick={continueEdit}>{modules.find(module => module.id === state.module) ? 'Continue' : 'Export'}<ArrowRight size={16} /></Button></div></div></>}
        <Modal open={info} onOpenChange={setInfo} title="Source video" description="Read directly from the file. Never uploaded."><dl className="metadata-list"><dt>File</dt><dd>{project.source.name}</dd><dt>Duration</dt><dd>{timecode(project.metadata.duration, true)}</dd><dt>Dimensions</dt><dd>{project.metadata.width} × {project.metadata.height}</dd><dt>Video codec</dt><dd>{project.metadata.videoCodec.toUpperCase()}</dd><dt>Audio codec</dt><dd>{project.metadata.audioCodec?.toUpperCase() ?? 'No audio'}</dd><dt>Frame rate</dt><dd>{project.metadata.fps ? `${project.metadata.fps.toFixed(2)} fps` : 'Not reported'}</dd><dt>File size</dt><dd>{bytes(project.metadata.size)}</dd></dl></Modal>
        <Modal open={exportOpen} onOpenChange={setExportOpen} title="Export your take" description="A real MP4 rendered on this device."><div className="export-summary"><div><span className="mono">EDITED DURATION</span><strong><NumberTicker value={map.outputDuration} format={timecode} /></strong></div><span className="export-format">MP4</span></div><div className="quality-options">{([720, 1080] as const).map(quality => <Button key={quality} variant={project.exportConfig.quality === quality ? 'default' : 'outline'} className="quality-option" disabled={quality === 1080 && !state.capabilities?.supported1080} onClick={() => studio.patch({ exportConfig: { quality, fps: 30 } })}><div><strong>{quality}p</strong><span>{quality === 720 && state.capabilities?.constrained ? 'Recommended on this device' : quality === 1080 ? 'Higher detail' : 'Standard detail'}</span></div>{project.exportConfig.quality === quality ? <Check size={18} /> : <span className="radio-ring" />}</Button>)}</div><div className="export-specs mono"><span>{outputDimensions.width} × {outputDimensions.height}</span><span>H.264</span><span>{project.metadata.hasAudio ? 'AAC' : 'NO AUDIO'}</span><span>{Math.round(project.metadata.fps || 30)} FPS</span></div><p className="export-privacy"><Check size={16} />Your source and original audio stay on this device.</p><Button variant="default" size="large" className="full-width" disabled={busy} onClick={() => { setExportOpen(false); player.current?.pause(); void studio.export(); }}>Export MP4<ArrowRight size={18} /></Button></Modal>
    </div>;
}
