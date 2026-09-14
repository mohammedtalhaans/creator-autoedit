import { describe, it, expect } from 'vitest';
import { analyzeSignal, decisionsFor, projectCuts } from './index';
import type { Project } from '../../types/project';

function fixture(quiet = false) {
    const rate = 16_000;
    const pcm = new Float32Array(rate * 8);
    for (let i = 0; i < pcm.length; i++) {
        const t = i / rate;
        const active = t < 2 || (t >= 3.5 && t < 5) || (t >= 5.18 && t < 8);
        pcm[i] = active ? (quiet ? .025 : .2) * Math.sin(2 * Math.PI * 170 * t) * (.6 + .4 * Math.sin(2 * Math.PI * 4 * t) ** 2) : .0008 * Math.sin(i * 1.731);
    }
    return pcm;
}

describe('deterministic audio gate', () => {
    it('finds long dead air and exposes the measured gaps', () => {
        const result = analyzeSignal(fixture(), 16_000);
        expect(result.pauses).toHaveLength(2);
        expect(result.pauses[0].start).toBeCloseTo(2, 1);
        expect(result.pauses[0].end).toBeCloseTo(3.5, 1);
        expect(result.pauses[1].start).toBeCloseTo(5, 1);
        expect(result.pauses[1].end).toBeCloseTo(5.18, 1);
    });

    it('keeps quiet continuous activity while exposing both gaps', () => {
        expect(analyzeSignal(fixture(true), 16_000).pauses).toHaveLength(2);
    });

    it('never removes the whole all-silent clip', () => {
        expect(analyzeSignal(new Float32Array(16_000 * 5), 16_000).pauses).toHaveLength(0);
    });

    it('does not mistake constant room noise for an activity transition', () => {
        const pcm = Float32Array.from({ length: 32_000 }, (_, i) => .01 * Math.sin(i * .17));
        expect(analyzeSignal(pcm, 16_000).pauses).toHaveLength(0);
    });

    it('returns bounded overview data', () => {
        const waveform = analyzeSignal(fixture(), 16_000, 512).waveform;
        expect(waveform.peaks).toHaveLength(512);
        expect(waveform.rms).toHaveLength(512);
        expect(waveform.duration).toBe(8);
        expect(waveform.peaks.every(value => value >= 0 && value <= 1)).toBe(true);
    });

    it('keeps more of a natural gap than a tight gap', () => {
        const pauses = analyzeSignal(fixture(), 16_000).pauses;
        const natural = decisionsFor(pauses, 'natural')[0];
        const tight = decisionsFor(pauses, 'tight')[0];
        expect(tight.end - tight.start).toBeGreaterThan(natural.end - natural.start);
    });

    it('supports restoring a cut and applying the off preset', () => {
        const pauses = analyzeSignal(fixture(), 16_000).pauses;
        expect(decisionsFor(pauses, 'off')[0].enabled).toBe(false);
        expect(decisionsFor(pauses, 'natural', .5, { [pauses[0].id]: false })[0].enabled).toBe(false);
    });

    it('keeps at least 150 ms before a low-energy leading onset', () => {
        const rate = 16_000;
        const pcm = new Float32Array(rate * 2);
        for (let i = 0; i < pcm.length; i++) {
            const t = i / rate;
            const ramp = t >= .1 && t < .24 ? .002 + (.2 - .002) * (t - .1) / .14 : 0;
            const active = t >= .24 && t < .6 ? .2 : t >= 1.1;
            pcm[i] = (ramp || active) ? (ramp || .2) * Math.sin(2 * Math.PI * 180 * t) : .0003 * Math.sin(i * .73);
        }
        const pauses = analyzeSignal(pcm, rate).pauses;
        const cuts = decisionsFor(pauses, 'tight', .5, {}, { duration: 2 });
        const leading = cuts.find(cut => cut.start < .3);
        if (leading)
            expect(leading.start).toBeGreaterThanOrEqual(.15);
        expect(cuts.every(cut => !leading || cut.id !== leading.id || cut.start >= .15)).toBe(true);
    });

    it('keeps the conservative handle before an internal rising onset', () => {
        const pause = [{ id: 'rising', start: 1, end: 1.6, confidence: 1 }];
        const cut = decisionsFor(pause, 'tight', .5, {}, { duration: 3 })[0];
        expect(cut.start).toBeCloseTo(1.04, 3);
        expect(cut.end).toBeCloseTo(1.48, 3);
    });

    it('does not turn a short click into an automatic cut candidate', () => {
        const rate = 16_000;
        const pcm = new Float32Array(rate * 2);
        for (let i = 0; i < 160; i++) pcm[rate + i] = .95 * Math.sin(i * .4);
        const result = analyzeSignal(pcm, rate);
        expect(result.pauses).toHaveLength(0);
    });

    it('migrates legacy symmetric padding and clamps asymmetric handles', () => {
        const pause = [{ id: 'gap', start: 1, end: 2, confidence: 1 }];
        const legacy = decisionsFor(pause, 'tight', .5, {}, { duration: 3, padding: .1 })[0];
        expect(legacy.start).toBeCloseTo(1.1, 3);
        expect(legacy.end).toBeCloseTo(1.9, 3);
        const asymmetric = decisionsFor(pause, 'tight', .5, {}, { duration: 3, afterSpeechPadding: .04, beforeSpeechPadding: .12 })[0];
        expect(asymmetric.start).toBeCloseTo(1.04, 3);
        expect(asymmetric.end).toBeCloseTo(1.88, 3);
    });

    it('applies per-cut keep-more adjustments without inverting the range', () => {
        const pause = [{ id: 'gap', start: 1, end: 2, confidence: 1 }];
        const adjusted = decisionsFor(pause, 'tight', .5, {}, { duration: 3, afterSpeechPadding: .04, beforeSpeechPadding: .12, cutAdjustments: { gap: { startDelta: .05, endDelta: -.05 } } })[0];
        expect(adjusted.start).toBeCloseTo(1.09, 3);
        expect(adjusted.end).toBeCloseTo(1.83, 3);
        const trimmed = decisionsFor(pause, 'tight', .5, {}, { duration: 3, afterSpeechPadding: .04, beforeSpeechPadding: .12, cutAdjustments: { gap: { startDelta: -.05, endDelta: .05 } } })[0];
        expect(trimmed.start).toBeCloseTo(1, 3);
        expect(trimmed.end).toBeCloseTo(1.93, 3);
        const kept = decisionsFor(pause, 'tight', .5, {}, { duration: 3, afterSpeechPadding: .4, beforeSpeechPadding: .4, cutAdjustments: { gap: { startDelta: .4, endDelta: -.4 } } })[0];
        expect(kept.enabled).toBe(false);
        expect(kept.end).toBe(kept.start);
    });

    it('ignores old transcript protection and keeps an all-silent project exportable', () => {
        const cut = decisionsFor([{ id: 'silence', start: 1, end: 2, confidence: 1 }], 'natural', .5, {}, { duration: 3, protectWords: [{ id: 'word', text: 'quiet', start: 1.4, end: 1.6 }] } as never)[0];
        expect(cut.enabled).toBe(true);
        const project = { metadata: { duration: 3 }, pauses: [], cutPreset: 'natural', sensitivity: .5, overrides: {}, cutAdjustments: [] } as unknown as Project;
        expect(projectCuts(project)).toEqual([]);
    });

    it('uses the measured energy pauses for legacy speech detector projects', () => {
        const project = { metadata: { duration: 3 }, pauses: [{ id: 'energy-gap', start: 1, end: 2, confidence: 1 }], speechPauses: [], speechStatus: { status: 'ready', detail: 'legacy' }, cutConfig: { detector: 'speech', minPause: .2, padding: .08 }, cutPreset: 'natural', sensitivity: .5, overrides: {}, cutAdjustments: {} } as unknown as Project;
        expect(projectCuts(project).some(cut => cut.enabled)).toBe(true);
    });
});
