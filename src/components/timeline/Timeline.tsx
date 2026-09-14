import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Scissors, Check, AudioLines } from 'lucide-react';
import type { Project, CutDecision } from '../../types/project';
import { EditMap } from '../../features/edit-map';
import { Slider, Card } from '../ui/primitives';
import { timecode, cn } from '../../lib/utils';

type Segment = { start: number; end: number; weight: number; cut?: CutDecision };
function segmentsFor(duration: number, cuts: CutDecision[], raw: boolean): Segment[] {
    const segments: Segment[] = [];
    let at = 0;
    for (const cut of cuts) {
        if (cut.start > at) segments.push({ start: at, end: cut.start, weight: cut.start - at });
        segments.push({ start: cut.start, end: cut.end, weight: cut.enabled && !raw ? Math.min(.28, Math.max(.01, (cut.end - cut.start) * .15)) : Math.max(.001, cut.end - cut.start), cut });
        at = Math.max(at, cut.end);
    }
    if (at < duration) segments.push({ start: at, end: duration, weight: duration - at });
    return segments;
}
function wavePath(project: Project, start: number, end: number) {
    const data = project.waveform.peaks;
    if (!data.length) return '';
    const a = Math.floor(start / Math.max(.001, project.metadata.duration) * data.length);
    const b = Math.ceil(end / Math.max(.001, project.metadata.duration) * data.length);
    const count = Math.min(140, Math.max(2, b - a));
    let path = '';
    for (let i = 0; i < count; i++) {
        const from = Math.floor(a + (b - a) * i / count);
        const to = Math.max(from + 1, Math.floor(a + (b - a) * (i + 1) / count));
        let value = 0;
        for (let j = from; j < to; j++) value = Math.max(value, data[j] ?? 0);
        const height = Math.min(25, Math.max(1.1, Math.sqrt(value) * 28));
        const x = (i + .5) / count * 100;
        path += `M${x.toFixed(2)},${(30 - height).toFixed(2)}V${(30 + height).toFixed(2)}`;
    }
    return path;
}

export function Timeline({ project, map, cuts, time, raw, onSeek, onRestore }: { project: Project; map: EditMap; cuts: CutDecision[]; time: number; raw: boolean; onSeek: (time: number) => void; onRestore: (id: string, enabled: boolean) => void }) {
    const segments = useMemo(() => segmentsFor(project.metadata.duration, cuts, raw), [project.metadata.duration, cuts, raw]);
    const markerRefs = useRef(new Map<string, HTMLButtonElement>());
    const selected = cuts.find(cut => cut.enabled && time >= cut.start && time <= cut.end)?.id ?? null;
    useEffect(() => {
        if (!selected) return;
        markerRefs.current.get(selected)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [selected]);
    const total = Math.max(.001, segments.reduce((sum, segment) => sum + segment.weight, 0));
    let playhead = 0;
    for (const segment of segments) {
        if (time >= segment.end) playhead += segment.weight;
        else if (time >= segment.start) { playhead += segment.weight * (time - segment.start) / Math.max(.001, segment.end - segment.start); break; }
        else break;
    }
    const output = raw ? time : map.sourceTimeToOutputTime(time);
    const duration = raw ? project.metadata.duration : map.outputDuration;
    const removed = Math.max(0, project.metadata.duration - map.outputDuration);
    const virtualWidth = Math.max(640, Math.round(project.metadata.duration * 120));
    return <Card className="timeline-panel" aria-label="Edit timeline">
        <div className="timeline-title"><span><AudioLines size={15} />Timeline <span className="timeline-help">Select a cut to keep or remove it.</span></span><span className="timeline-saved"><Scissors size={12} />{removed.toFixed(1)}s removed</span></div>
        <div className="timeline-ruler mono">{[0, .25, .5, .75, 1].map(value => <span key={value}>{timecode(value * duration)}</span>)}</div>
        <div className="timeline-scroll"><div className="waveform-track" style={{ '--timeline-width': `${virtualWidth}px` } as CSSProperties} onPointerDown={event => {
            if ((event.target as HTMLElement).closest('button')) return;
            const rect = event.currentTarget.getBoundingClientRect();
            let hit = (event.clientX - rect.left) / rect.width * total;
            for (const segment of segments) {
                if (hit <= segment.weight) {
                    const source = segment.start + hit / Math.max(.001, segment.weight) * (segment.end - segment.start);
                    onSeek(raw ? source : map.sourceTimeToOutputTime(source));
                    break;
                }
                hit -= segment.weight;
            }
        }}>{segments.map(segment => <div className={cn('wave-segment', segment.cut?.enabled && !raw && 'cut-removed', segment.cut && !segment.cut.enabled && 'cut-restored')} key={`${segment.start}-${segment.end}`} style={{ flexGrow: segment.weight, flexBasis: 0 }}><svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><path d={wavePath(project, segment.start, segment.end)} vectorEffect="non-scaling-stroke" /></svg>{segment.cut && <button ref={element => { if (element) markerRefs.current.set(segment.cut!.id, element); else markerRefs.current.delete(segment.cut!.id); }} type="button" className="cut-marker" aria-label={`${segment.cut.enabled ? 'Keep' : 'Remove'} cut at ${timecode(segment.cut.start)}`} title={`${segment.cut.enabled ? 'Keep' : 'Remove'} · ${(segment.cut.end - segment.cut.start).toFixed(2)}s`} onClick={() => onRestore(segment.cut!.id, !segment.cut!.enabled)}>{segment.cut.enabled ? <Scissors size={14} /> : <Check size={14} />}</button>}</div>)}<div className="timeline-playhead" style={{ left: `${Math.max(0, Math.min(100, playhead / total * 100))}%` }}><i /></div></div></div>
        <div className="caption-lane" aria-label={`${project.words.length} timed caption words`}>{project.words.filter(word => raw || map.isSourceTimeKept(word.start)).slice(0, 180).map(word => <span key={word.id} style={{ left: `${(raw ? word.start : map.sourceTimeToOutputTime(word.start)) / Math.max(.001, duration) * 100}%`, width: `${Math.max(.18, (raw ? word.end - word.start : map.sourceTimeToOutputTime(word.end) - map.sourceTimeToOutputTime(word.start)) / Math.max(.001, duration) * 100)}%` }} />)}</div>
        <div className="accessible-seek"><Slider label={raw ? 'Seek original video' : 'Seek edited video'} value={Math.min(output, Math.max(0, duration - .001))} min={0} max={Math.max(.1, duration - .001)} step={.01} onChange={onSeek} display={`${timecode(output)} / ${timecode(duration)}`} /></div>
        <div className="timeline-footer mono"><span><i className="legend voice" />AUDIO <i className="legend captions" />CAPTIONS</span><span>{cuts.filter(cut => cut.enabled).length} CUTS <span className="slash">/</span> {timecode(map.outputDuration)} TOTAL</span></div>
    </Card>;
}
