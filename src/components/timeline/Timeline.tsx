import { useMemo } from 'react';
import { motion, LayoutGroup } from 'motion/react';
import { Scissors, Check, AudioLines } from 'lucide-react';
import type { Project, CutDecision } from '../../types/project';
import { EditMap } from '../../features/edit-map';
import { Slider } from '../ui/primitives';
import { timecode, cn } from '../../lib/utils';
type Segment = {
    start: number;
    end: number;
    weight: number;
    cut?: CutDecision;
};
function segmentsFor(duration: number, cuts: CutDecision[], raw: boolean): Segment[] {
    const out: Segment[] = [];
    let at = 0;
    for (const cut of cuts) {
        if (cut.start > at)
            out.push({ start: at, end: cut.start, weight: cut.start - at });
        out.push({ start: cut.start, end: cut.end, weight: cut.enabled && !raw ? Math.min(.28, (cut.end - cut.start) * .15) : cut.end - cut.start, cut });
        at = cut.end;
    }
    if (at < duration)
        out.push({ start: at, end: duration, weight: duration - at });
    return out;
}
function wavePath(project: Project, start: number, end: number) {
    const data = project.waveform.peaks;
    if (!data.length)
        return '';
    const a = Math.floor(start / project.metadata.duration * data.length), b = Math.ceil(end / project.metadata.duration * data.length), count = Math.min(110, Math.max(2, b - a));
    let d = '';
    for (let i = 0; i < count; i++) {
        const from = Math.floor(a + (b - a) * i / count), to = Math.max(from + 1, Math.floor(a + (b - a) * (i + 1) / count));
        let value = 0;
        for (let j = from; j < to; j++)
            value = Math.max(value, data[j] ?? 0);
        const h = Math.min(25, Math.max(1.1, Math.sqrt(value) * 28));
        const x = (i + .5) / count * 100;
        d += `M${x.toFixed(2)},${(30 - h).toFixed(2)}V${(30 + h).toFixed(2)}`;
    }
    return d;
}
export function Timeline({ project, map, cuts, time, raw, onSeek, onRestore }: {
    project: Project;
    map: EditMap;
    cuts: CutDecision[];
    time: number;
    raw: boolean;
    onSeek: (t: number) => void;
    onRestore: (id: string, enabled: boolean) => void;
}) {
    const segments = useMemo(() => segmentsFor(project.metadata.duration, cuts, raw), [project.metadata.duration, cuts, raw]);
    const total = segments.reduce((n, s) => n + s.weight, 0);
    let playhead = 0;
    for (const s of segments) {
        if (time >= s.end)
            playhead += s.weight;
        else if (time >= s.start) {
            playhead += s.weight * (time - s.start) / (s.end - s.start);
            break;
        }
        else
            break;
    }
    const output = raw ? time : map.sourceTimeToOutputTime(time), duration = raw ? project.metadata.duration : map.outputDuration, removed = project.metadata.duration - map.outputDuration;
    return <section className="timeline-panel" aria-label="Edit timeline"><div className="timeline-title"><span><AudioLines size={15}/>YOUR TIMELINE<span className="timeline-help">Tap a pause to keep it.</span></span><span className="timeline-saved"><Scissors size={12}/>{removed.toFixed(1)}s removed</span></div>
  <div className="timeline-ruler mono">{[0, .25, .5, .75, 1].map(t => <span key={t}>{timecode(t * duration)}</span>)}</div>
  <LayoutGroup><div className="waveform-track" onPointerDown={e => {
            if ((e.target as HTMLElement).closest('button'))
                return;
            const r = e.currentTarget.getBoundingClientRect();
            let hit = (e.clientX - r.left) / r.width * total;
            for (const s of segments) {
                if (hit <= s.weight) {
                    const source = s.start + hit / s.weight * (s.end - s.start);
                    onSeek(raw ? source : map.sourceTimeToOutputTime(source));
                    break;
                }
                hit -= s.weight;
            }
        }}>{segments.map(s => <motion.div layout className={cn('wave-segment', s.cut?.enabled && !raw && 'cut-removed', s.cut && !s.cut.enabled && 'cut-restored')} key={`${s.start}-${s.end}`} style={{ flexGrow: s.weight, flexBasis: 0 }} transition={{ type: 'spring', stiffness: 190, damping: 27 }}>
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><path d={wavePath(project, s.start, s.end)} vectorEffect="non-scaling-stroke"/></svg>
    {s.cut && <button type="button" className="cut-marker" aria-label={`${s.cut.enabled ? 'Keep' : 'Remove'} pause at ${timecode(s.start)}`} title={`${s.cut.enabled ? 'Keep pause' : 'Remove pause'} · ${(s.end - s.start).toFixed(1)}s`} onClick={() => onRestore(s.cut!.id, !s.cut!.enabled)}>{s.cut.enabled ? <Scissors size={11}/> : <Check size={11}/>}</button>}
   </motion.div>)}<motion.div className="timeline-playhead" animate={{ left: `${Math.max(0, Math.min(100, playhead / Math.max(.01, total) * 100))}%` }} transition={{ duration: .08, ease: 'linear' }}><i /></motion.div></div></LayoutGroup>
  <div className="caption-lane" aria-label={`${project.words.length} timed caption words`}>{project.words.filter(w => raw || map.isSourceTimeKept(w.start)).slice(0, 180).map(w => <span key={w.id} style={{ left: `${(raw ? w.start : map.sourceTimeToOutputTime(w.start)) / duration * 100}%`, width: `${Math.max(.18, (raw ? w.end - w.start : map.sourceTimeToOutputTime(w.end) - map.sourceTimeToOutputTime(w.start)) / duration * 100)}%` }}/>)}</div>
  <div className="accessible-seek"><Slider label={raw ? "Seek original video" : "Seek edited video"} value={output} min={0} max={Math.max(.1, duration - .001)} step={.01} onChange={onSeek} display={`${timecode(output)} / ${timecode(duration)}`}/></div>
  <div className="timeline-footer mono"><span><i className="legend voice"/>VOICE<i className="legend captions"/>CAPTIONS</span><span>{cuts.filter(c => c.enabled).length} CUTS<span className="slash">/</span>{timecode(map.outputDuration)} TOTAL</span></div>
 </section>;
}
