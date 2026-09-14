import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowLeft, Check, Download, Share2, ShieldCheck, Scissors, AudioLines, Captions, ScanFace, Film } from 'lucide-react';
import { studio, useStudio } from '../app/store';
import { Brand, RepositoryLink } from './Brand';
import { Button } from './ui/primitives';
import { BorderBeam, NumberTicker } from './magic/signal';
import { EditMap } from '../features/edit-map';
import { projectCuts } from '../features/silence';
import { saveVideo, shareVideo, canShareVideo } from '../features/sharing';
import { timecode, bytes, isAbort } from '../lib/utils';
export function Exporting() {
    const { project, tasks } = useStudio();
    const last = useRef(0), reduce = useReducedMotion();
    if (!project)
        return null;
    if (tasks.export.progress !== undefined)
        last.current = tasks.export.progress;
    const progress = last.current;
    const layers = [{ name: 'VIDEO', icon: Film, on: true }, { name: 'CAPTIONS', icon: Captions, on: project.captions.enabled && project.words.length > 0 }, { name: 'VOICE', icon: AudioLines, on: project.metadata.hasAudio }, { name: 'CUTS', icon: Scissors, on: project.cutPreset !== 'off' }, { name: 'FRAME', icon: ScanFace, on: true }].filter(l => l.on);
    return <div className="export-page"><header className="site-header"><Brand compact/><span className="local-label"><i />YOUR DEVICE IS THE STUDIO</span><Button variant="ghost" size="small" onClick={studio.cancel}>Cancel export</Button></header><main className="export-main"><div className="export-story"><span className="eyebrow"><span className="status-light"/> THE FINAL PASS</span><h1>All the layers.<br /><span>One good take.</span></h1><p>Your cuts, captions, voice and framing.<br />Coming together into a real MP4.</p><div className="export-progress-copy"><div><strong>{tasks.export.progress === undefined ? <span className="export-working">Working</span> : <><NumberTicker value={tasks.export.progress * 100} format={n => Math.floor(n).toString()}/><span>%</span></>}</strong><small className="mono">{tasks.export.progress === undefined ? 'LOCAL PROCESSING' : 'VIDEO FRAMES RENDERED'}</small></div><div className="export-status" role="status">{tasks.export.detail}</div></div><div className="export-progress-track" role="progressbar" aria-label="Video frames rendered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tasks.export.progress === undefined ? undefined : Math.round(tasks.export.progress * 100)}><span style={{ width: `${progress * 100}%` }}/></div><p className="export-stay"><ShieldCheck size={16}/>Keep this tab open. Your media stays here.</p></div>
 <div className="export-stack" aria-label="Editing layers merging into a finished video">{layers.map((layer, i) => <motion.div className="export-layer" key={layer.name} style={{ zIndex: layers.length - i }} animate={{ x: reduce ? 0 : (i - 2) * 21 * (1 - progress), y: reduce ? 0 : (i - 2) * 27 * (1 - progress), rotate: reduce ? 0 : (i - 2) * 3 * (1 - progress), opacity: i === 0 ? 1 : 1 - progress * .88 }} transition={{ type: 'spring', stiffness: 70, damping: 22 }}><div className="layer-title mono"><layer.icon size={13}/>{layer.name}<Check size={12}/></div>{i === 0 && <div className="layer-image"><img src={project.source.thumbnail} alt="Your video being rendered"/><BorderBeam /><span className="layer-file mono">AUTOEDIT.MP4</span></div>}</motion.div>)}<div className="stack-caption mono">NO CLOUD. NO QUEUE. JUST YOUR DEVICE.</div></div></main></div>;
}
export function Complete({ onAbout, onNew }: {
    onAbout: () => void;
    onNew: () => void;
}) {
    const { project, result } = useStudio(), [sharing, setSharing] = useState(false);
    if (!project || !result)
        return null;
    const map = EditMap.fromCuts(project.metadata.duration, projectCuts(project));
    const words = project.captions.enabled ? project.words.filter(w => map.remapWord(w)).length : 0;
    const share = async () => {
        setSharing(true);
        try {
            await shareVideo(result);
        }
        catch (error) {
            if (!isAbort(error))
                studio.fail('The video couldn’t be shared', error);
        }
        finally {
            setSharing(false);
        }
    };
    return <div className="complete-page"><header className="site-header"><Brand compact onClick={onNew}/><RepositoryLink onAbout={onAbout}/></header><main className="complete-main"><div className="complete-copy"><motion.div className="completion-check" initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }}><Check size={23}/></motion.div><span className="eyebrow">YOUR GOOD TAKE, FINISHED.</span><h1>Ready<br /><span>to post.</span></h1><p>Sounds like you. Looks like you.<br />Just without the awkward parts.</p><div className="result-metrics"><div><span>ORIGINAL</span><NumberTicker value={project.metadata.duration} format={timecode}/></div><div><span>EDITED</span><NumberTicker value={result.duration} format={timecode}/></div><div><span>REMOVED</span><strong><NumberTicker value={project.metadata.duration - result.duration}/><small>s</small></strong></div><div><span>CAPTIONS</span><strong><NumberTicker value={words} format={n => Math.round(n).toString()}/><small>words</small></strong></div></div><div className="complete-actions">{canShareVideo(result) && <Button variant="primary" size="large" disabled={sharing} onClick={() => void share()}><Share2 size={18}/>Share video<ArrowRight size={17}/></Button>}<Button variant={canShareVideo(result) ? 'secondary' : 'primary'} size="large" onClick={() => saveVideo(result)}><Download size={18}/>Save video</Button></div><p className="save-hint">On iPhone, use Share → Save Video when available, or save the MP4 to Files.</p><button className="edit-again" onClick={studio.editAgain}><ArrowLeft size={14}/>Edit again</button><div className="open-source-note"><span>Free & open source.</span><RepositoryLink onAbout={onAbout} label="Open on GitHub"/></div></div><div className="finished-video"><motion.div layoutId="project-monitor" className="result-video-card" style={{ aspectRatio: `${result.width}/${result.height}` }}><video src={result.url} controls playsInline preload="metadata" aria-label="Your finished exported MP4"/></motion.div><div className="result-file-info"><span><Check size={12}/>{result.name}</span><span className="mono">{result.width} × {result.height} · {bytes(result.size)} · MP4</span></div></div></main></div>;
}
