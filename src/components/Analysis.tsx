import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, FileVideo, AudioLines } from 'lucide-react';
import { studio, useStudio } from '../app/store';
import { Brand } from './Brand';
import { Button } from './ui/primitives';
import { TaskRow } from './TaskRow';
import { BorderBeam, BlurFade, NumberTicker } from './magic/signal';
import { EditMap } from '../features/edit-map';
import { projectCuts } from '../features/silence';
import { timecode } from '../lib/utils';
export function Analysis() {
    const { project, tasks } = useStudio();
    const map = project ? EditMap.fromCuts(project.metadata.duration, projectCuts(project)) : null;
    return <div className="analysis-page"><header className="site-header"><Brand compact onClick={studio.cancel}/><span className="local-label"><i />PROCESSED ON YOUR DEVICE</span><Button variant="ghost" size="small" onClick={studio.cancel}>Cancel</Button></header><main className="analysis-main"><section className="analysis-copy"><span className="eyebrow"><span className="status-light"/> YOUR TAKE IS IN GOOD HANDS.</span><h1>Finding the<br /><span>good parts.</span></h1><p>One take, a little less friction.<br />Your studio is coming together.</p>
  <div className="analysis-tasks">{[{ key: 'read', title: 'Reading your video' }, { key: 'audio', title: 'Building the waveform' }, { key: 'pauses', title: 'Finding the dead air' }, { key: 'voice', title: 'Balancing your voice' }, { key: 'face', title: 'Framing your subject' }, { key: 'captions', title: 'Building captions locally' }].map(item => <TaskRow key={item.key} title={item.title} task={tasks[item.key as keyof typeof tasks]}/>)}</div>
  {project && <Button variant="secondary" onClick={studio.review}>Review while we work<ArrowRight size={15}/></Button>}
  <p className="analysis-privacy"><ShieldCheck size={15}/>The first use downloads processing models.<br />Your video and audio are not uploaded.</p>
 </section><section className="analysis-visual"><div className="analysis-viewfinder"><div className="monitor-grid"/><span className="mono analysis-visual-label">LOCAL SIGNAL / INGEST</span><motion.div layoutId="project-monitor" className="analysis-thumbnail">{project?.source.thumbnail ? <img src={project.source.thumbnail} alt="A frame from your selected video"/> : <div className="ingest-empty"><FileVideo size={42} strokeWidth={1}/><span>Opening your local file</span></div>}<BorderBeam /></motion.div>{project && <BlurFade className="analysis-metadata"><span className="mono">{timecode(project.metadata.duration)}</span><span className="mono">{project.metadata.width} × {project.metadata.height}</span><span className="mono">{project.metadata.videoCodec.toUpperCase()}</span></BlurFade>}</div>
  {project && map && <div className="analysis-results"><div><span>ORIGINAL</span><NumberTicker value={project.metadata.duration} format={timecode}/></div><ArrowRight size={19}/><div><span>YOUR EDIT</span><NumberTicker value={map.outputDuration} format={timecode}/></div><div className="removed-result"><NumberTicker value={project.metadata.duration - map.outputDuration}/><small>s removed</small></div></div>}
  <div className="analysis-waveform"><span className="mono"><AudioLines size={13}/> YOUR ACTUAL AUDIO</span><svg viewBox="0 0 600 72" preserveAspectRatio="none" aria-label="Extracted waveform">{project?.waveform.peaks.filter((_, i) => i % 4 === 0).map((value, i, all) => { const h = Math.max(1, Math.sqrt(value) * 31); return <motion.path key={i} d={`M${i / all.length * 600} ${36 - h} V${36 + h}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .3, delay: i * .0015 }}/>; })}</svg>{!!project?.words.length && <div className="analysis-words">{project.words.slice(0, 12).map((w, i) => <motion.span key={w.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .04 }}>{w.text}</motion.span>)}</div>}</div>
 </section></main></div>;
}
