import type { KeepRange, MappedRange, CutDecision, TranscriptWord } from '../../types/project';
const EPS = 1e-9;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** The only timeline authority. Half-open intervals; a seam belongs to the NEXT kept range. */
export class EditMap {
    readonly ranges: MappedRange[];
    readonly outputDuration: number;
    readonly sourceDuration: number;
    constructor(sourceDuration: number, ranges: KeepRange[]) {
        if (!Number.isFinite(sourceDuration) || sourceDuration < 0)
            throw new Error('Invalid source duration');
        this.sourceDuration = sourceDuration;
        const sorted = ranges.map(r => ({ sourceStart: clamp(r.sourceStart, 0, sourceDuration), sourceEnd: clamp(r.sourceEnd, 0, sourceDuration) })).filter(r => Number.isFinite(r.sourceStart) && Number.isFinite(r.sourceEnd) && r.sourceEnd - r.sourceStart > EPS).sort((a, b) => a.sourceStart - b.sourceStart);
        const merged: KeepRange[] = [];
        for (const r of sorted) {
            const last = merged.at(-1);
            if (last && r.sourceStart <= last.sourceEnd + EPS)
                last.sourceEnd = Math.max(last.sourceEnd, r.sourceEnd);
            else
                merged.push({ ...r });
        }
        let out = 0;
        this.ranges = merged.map(r => { const result = { ...r, outputStart: out, outputEnd: out + r.sourceEnd - r.sourceStart }; out = result.outputEnd; return result; });
        this.outputDuration = out;
    }
    static fromCuts(duration: number, cuts: CutDecision[]) {
        const removed = cuts.filter(c => c.enabled && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start).map(c => ({ start: clamp(c.start, 0, duration), end: clamp(c.end, 0, duration) })).sort((a, b) => a.start - b.start);
        const kept: KeepRange[] = [];
        let cursor = 0;
        for (const cut of removed) {
            if (cut.start > cursor + EPS)
                kept.push({ sourceStart: cursor, sourceEnd: cut.start });
            cursor = Math.max(cursor, cut.end);
        }
        if (cursor < duration - EPS)
            kept.push({ sourceStart: cursor, sourceEnd: duration });
        return new EditMap(duration, kept);
    }
    sourceTimeToOutputTime(t: number): number {
        t = clamp(Number.isFinite(t) ? t : 0, 0, this.sourceDuration);
        for (const r of this.ranges) {
            if (t < r.sourceStart)
                return r.outputStart;
            if (t < r.sourceEnd)
                return r.outputStart + t - r.sourceStart;
        }
        return this.outputDuration;
    }
    outputTimeToSourceTime(t: number): number {
        if (!this.ranges.length)
            return 0;
        t = clamp(Number.isFinite(t) ? t : 0, 0, this.outputDuration);
        for (const r of this.ranges)
            if (t < r.outputEnd - EPS)
                return r.sourceStart + Math.max(0, t - r.outputStart);
        return this.ranges.at(-1)!.sourceEnd;
    }
    isSourceTimeKept(t: number): boolean { return this.ranges.some(r => t >= r.sourceStart - EPS && t < r.sourceEnd - EPS); }
    removedDurationBefore(t: number): number { t = clamp(t, 0, this.sourceDuration); return t - this.sourceTimeToOutputTime(t); }
    nextKeptSourceTime(t: number): number | null {
        for (const r of this.ranges) {
            if (t < r.sourceStart)
                return r.sourceStart;
            if (t < r.sourceEnd - EPS)
                return t;
        }
        return null;
    }
    intersections(start: number, end: number): MappedRange[] {
        return this.ranges.flatMap(r => { const s = Math.max(start, r.sourceStart), e = Math.min(end, r.sourceEnd); return e > s + EPS ? [{ sourceStart: s, sourceEnd: e, outputStart: r.outputStart + s - r.sourceStart, outputEnd: r.outputStart + e - r.sourceStart }] : []; });
    }
    remapWord(word: TranscriptWord): TranscriptWord | null {
        const parts = this.intersections(word.start, word.end);
        if (!parts.length)
            return null;
        return { ...word, start: parts[0].outputStart, end: parts.at(-1)!.outputEnd };
    }
    rangeAtSource(t: number): number { return this.ranges.findIndex(r => t >= r.sourceStart && t < r.sourceEnd); }
}
export const sourceTimeToOutputTime = (t: number, map: EditMap) => map.sourceTimeToOutputTime(t);
export const outputTimeToSourceTime = (t: number, map: EditMap) => map.outputTimeToSourceTime(t);
export const isSourceTimeKept = (t: number, map: EditMap) => map.isSourceTimeKept(t);
export const removedDurationBefore = (t: number, map: EditMap) => map.removedDurationBefore(t);
/** Generate a constant-rate output clock, then map each timestamp back to the source.
 * This drops removed source samples without accumulating per-cut video frame rounding. */
export function* renderClock(map: EditMap, fps = 30) {
    if (!Number.isFinite(fps) || fps <= 0)
        throw new Error('Invalid frame rate');
    for (let frame = 0; frame < Math.ceil(map.outputDuration * fps - 1e-8); frame++) {
        const outputTime = frame / fps;
        yield { frame, outputTime, sourceTime: map.outputTimeToSourceTime(outputTime), duration: Math.min(1 / fps, map.outputDuration - outputTime) };
    }
}
