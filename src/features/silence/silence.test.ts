import { describe, it, expect } from 'vitest';
import { analyzeSignal, decisionsFor, pausesFromSpeechSegments, projectCuts, speechSegmentsFromProbabilities } from './index';
import type { Project } from '../../types/project';
function fixture(quiet = false) {
    const rate = 16000, pcm = new Float32Array(rate * 8);
    for (let i = 0; i < pcm.length; i++) {
        const t = i / rate, speaking = t < 2 || (t >= 3.5 && t < 5) || (t >= 5.18 && t < 8);
        pcm[i] = speaking ? (quiet ? .025 : .2) * Math.sin(2 * Math.PI * 170 * t) * (.6 + .4 * Math.sin(2 * Math.PI * 4 * t) ** 2) : .0008 * Math.sin(i * 1.731);
    }
    return pcm;
}
describe('speech-aware pause detection', () => {
    it('finds long dead air and exposes a shorter gap for Jump cut', () => { const r = analyzeSignal(fixture(), 16000); expect(r.pauses).toHaveLength(2); expect(r.pauses[0].start).toBeCloseTo(2, 1); expect(r.pauses[0].end).toBeCloseTo(3.5, 1); expect(r.pauses[1].start).toBeCloseTo(5, 1); expect(r.pauses[1].end).toBeCloseTo(5.18, 1); });
    it('preserves quiet speech while exposing both gaps', () => { expect(analyzeSignal(fixture(true), 16000).pauses).toHaveLength(2); });
    it('never removes the whole clip on silence', () => { expect(analyzeSignal(new Float32Array(16000 * 5), 16000).pauses).toHaveLength(0); });
    it('does not mistake constant room noise for speech', () => { const p = Float32Array.from({ length: 32000 }, (_, i) => .01 * Math.sin(i * .17)); expect(analyzeSignal(p, 16000).pauses).toHaveLength(0); });
    it('produces bounded overview data', () => { const w = analyzeSignal(fixture(), 16000, 512).waveform; expect(w.peaks).toHaveLength(512); expect(w.rms).toHaveLength(512); expect(w.duration).toBe(8); expect(w.peaks.every(v => v >= 0 && v <= 1)).toBe(true); });
    it('Natural preserves more room than Tight', () => { const pauses = analyzeSignal(fixture(), 16000).pauses; const n = decisionsFor(pauses, 'natural')[0], t = decisionsFor(pauses, 'tight')[0]; expect(t.end - t.start).toBeGreaterThan(n.end - n.start); });
    it('Off and restored pauses remain kept', () => { const p = analyzeSignal(fixture(), 16000).pauses; expect(decisionsFor(p, 'off')[0].enabled).toBe(false); expect(decisionsFor(p, 'natural', .5, { [p[0].id]: false })[0].enabled).toBe(false); });
    it('handles tiny inputs and invalid samples', () => { expect(analyzeSignal(new Float32Array(), 16000).waveform.duration).toBe(0); expect(analyzeSignal(new Float32Array([NaN, Infinity]), 16000).waveform.peaks[0]).toBe(0); });
    it('complements speech with leading and trailing pauses', () => {
        const pauses = pausesFromSpeechSegments([{ start: 1, end: 2 }], 4);
        expect(pauses.map(p => [p.start, p.end])).toEqual([[0, 1], [2, 4]]);
    });
    it('protects timestamped words from automatic cuts', () => {
        const p = [{ id: 'silence', start: 0, end: 2, confidence: 1 }];
        const cuts = decisionsFor(p, 'natural', .5, {}, { duration: 3, protectWords: [{ id: 'word', text: 'quiet', start: .9, end: 1.1 }] });
        expect(cuts.some(c => c.start < 1.1 && c.end > .9 && c.enabled)).toBe(false);
    });
    it('keeps an all-silent project exportable', () => {
        const project = { metadata: { duration: 3 }, pauses: pausesFromSpeechSegments([], 3), cutPreset: 'natural', sensitivity: .5, overrides: {}, words: [] } as unknown as Project;
        expect(projectCuts(project).some(c => c.enabled)).toBe(false);
    });
    it('trusts a ready empty speech result instead of resurrecting energy cuts', () => {
        const project = { metadata: { duration: 3 }, pauses: [{ id: 'energy-gap', start: 1, end: 2, confidence: 1 }], speechPauses: [], speechStatus: { status: 'ready', detail: 'No spoken regions' }, cutConfig: { detector: 'speech', minPause: .2, padding: .08 }, cutPreset: 'natural', sensitivity: .5, overrides: {}, words: [] } as unknown as Project;
        expect(projectCuts(project)).toEqual([]);
    });
    it('keeps the source while selected speech detection is pending or failed', () => {
        const base = { metadata: { duration: 3 }, pauses: [{ id: 'energy-gap', start: 1, end: 2, confidence: 1 }], cutConfig: { detector: 'speech', minPause: .064, padding: .01 }, cutPreset: 'jump', sensitivity: .5, overrides: {}, words: [] };
        expect(projectCuts({ ...base, speechStatus: { status: 'preparing', detail: 'Loading' } } as unknown as Project)).toEqual([]);
        expect(projectCuts({ ...base, speechStatus: { status: 'error', detail: 'Unavailable' } } as unknown as Project)).toEqual([]);
    });
    it('Jump cut keeps only a tiny seam after a 64 ms gap', () => {
        const cut = decisionsFor([{ id: 'gap-64', start: 1, end: 1.064, confidence: 1 }], 'jump', .5, {}, { duration: 2, minPause: .064, padding: .01 })[0];
        expect(cut.enabled).toBe(true);
        expect(cut.end - cut.start).toBeCloseTo(.044, 3);
    });
    it('Jump cut shortens a 100 ms gap by the configured edge padding', () => {
        const cut = decisionsFor([{ id: 'gap-100', start: 1, end: 1.1, confidence: 1 }], 'jump', .5, {}, { duration: 2, minPause: .064, padding: .01 })[0];
        expect(cut.end - cut.start).toBeCloseTo(.08, 3);
    });
    it('keeps a two-frame quiet VAD gap as a real pause boundary', () => {
        const segments = speechSegmentsFromProbabilities([.9, .9, .9, .9, .01, .01, .9, .9, .9, .9], .32, { minSilenceFrames: 2 });
        expect(segments).toHaveLength(2);
        expect(segments[0].end).toBeCloseTo(.128, 3);
        expect(segments[1].start).toBeCloseTo(.192, 3);
        expect(pausesFromSpeechSegments(segments, .32)[0].end - pausesFromSpeechSegments(segments, .32)[0].start).toBeCloseTo(.064, 3);
    });
    it('rejects a noise plateau and an isolated click spike', () => {
        expect(speechSegmentsFromProbabilities([.1, .2, .3, .25, .2, .1], .192)).toEqual([]);
        expect(speechSegmentsFromProbabilities([.01, .92, .02, .01, .01], .16)).toEqual([]);
    });
    it('keeps coherent quiet speech and reports score-derived confidence', () => {
        const segments = speechSegmentsFromProbabilities([.01, .54, .57, .59, .56, .02], .192);
        expect(segments).toHaveLength(1);
        expect(segments[0].confidence).toBeGreaterThan(.2);
        expect(segments[0].confidence).toBeLessThan(.5);
    });
    it('does not let a hallucinated long word uncut a noisy interval', () => {
        const project = { metadata: { duration: 2 }, pauses: [], speechSegments: [{ start: .2, end: .6 }], speechPauses: [{ id: 'noise', start: .6, end: 1.8, confidence: 1 }], speechStatus: { status: 'ready', detail: 'ready' }, cutConfig: { detector: 'speech', minPause: .064, padding: .01 }, cutPreset: 'jump', sensitivity: .5, overrides: {}, words: [{ id: 'hallucinated', text: 'music', start: .65, end: 1.75 }] } as unknown as Project;
        const cut = projectCuts(project).find(item => item.id === 'noise');
        expect(cut?.enabled).toBe(true);
    });
    it('keeps an ASR word only where it overlaps credible VAD speech', () => {
        const project = { metadata: { duration: 2 }, pauses: [], speechSegments: [{ start: .2, end: .8 }], speechPauses: [{ id: 'gap', start: .8, end: 1.2, confidence: 1 }], speechStatus: { status: 'ready', detail: 'ready' }, cutConfig: { detector: 'speech', minPause: .064, padding: .01 }, cutPreset: 'jump', sensitivity: .5, overrides: {}, words: [{ id: 'word', text: 'quiet', start: .78, end: .82 }] } as unknown as Project;
        const cuts = projectCuts(project);
        expect(cuts.every(cut => cut.end <= .78 || cut.start >= .82)).toBe(true);
    });
});
