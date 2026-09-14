import { describe, it, expect } from 'vitest';
import { resample, enhanceVoice, audioBlock, signalStats, makeWav } from './dsp';
import { EditMap } from '../edit-map';
describe('audio sample clock and voice processing', () => {
    it('preserves resampled duration', () => { expect(resample(new Float32Array(48000), 48000, 16000).length).toBe(16000); });
    it('preserves DC gain during resampling', () => { const p = resample(new Float32Array(480).fill(.4), 48000, 16000); expect(p[80]).toBeCloseTo(.4, 5); });
    it('enhancement measurably changes audio but not length', () => { const p = Float32Array.from({ length: 48000 }, (_, i) => .04 + .2 * Math.sin(i * .05)); const r = enhanceVoice(p); expect(r.pcm.length).toBe(p.length); expect(r.pcm[1000]).not.toBe(p[1000]); expect(r.stats.peakDb).toBeLessThanOrEqual(-.99); });
    it('does not amplify digital silence', () => { const r = enhanceVoice(new Float32Array(10000)); expect(r.pcm.every(v => v === 0)).toBe(true); });
    it('normalizes invalid audio safely', () => { expect(Number.isFinite(enhanceVoice(new Float32Array([NaN, 1, Infinity])).pcm[1])).toBe(true); });
    it('never loses a block straddling a cut', () => { const rate = 48000, source = new Float32Array(rate * 3).fill(.5); const m = EditMap.fromCuts(3, [{ id: 'c', start: 1, end: 2, enabled: true }]); const out = audioBlock(source, m, rate - 512, 1024, rate); expect(out).toHaveLength(1024); expect(out[0]).toBe(.5); expect(out[1023]).toBe(.5); expect(out[512]).toBe(.5); });
    it('maps 80 asynchronous audio boundaries within half a sample', () => { const rate = 48000, cuts = Array.from({ length: 80 }, (_, i) => ({ id: `${i}`, start: i * .13 + .02123, end: i * .13 + .06127, enabled: true })), m = EditMap.fromCuts(12, cuts); expect(Math.abs(Math.round(m.outputDuration * rate) / rate - m.outputDuration)).toBeLessThanOrEqual(.5 / rate); });
    it('produces a valid PCM WAV header', async () => { const blob = makeWav(new Float32Array(480)); expect(blob.size).toBe(1004); const view = new DataView(await blob.arrayBuffer()); expect(view.getUint32(24, true)).toBe(48000); expect(view.getUint16(22, true)).toBe(1); });
    it('reports actual amplitude', () => { expect(signalStats(new Float32Array(1000).fill(.5)).peakDb).toBeCloseTo(-6.0206, 3); });
    it('crossfades opposite source levels without a discontinuity', () => {
        const rate = 1000, source = new Float32Array(3000);
        source.fill(.5, 0, 1500);
        source.fill(-.5, 1500);
        const m = EditMap.fromCuts(3, [{ id: 'c', start: 1, end: 2, enabled: true }]);
        const out = audioBlock(source, m, 994, 12, rate);
        let jump = 0;
        for (let i = 1; i < out.length; i++)
            jump = Math.max(jump, Math.abs(out[i] - out[i - 1]));
        expect(jump).toBeLessThanOrEqual(.251);
    });
    it('audio crossfades are identical across arbitrary block boundaries', () => {
        const source = Float32Array.from({ length: 12000 }, (_, i) => Math.sin(i * .077) * .3), m = EditMap.fromCuts(3, [{ id: 'c', start: 1.021, end: 1.876, enabled: true }]);
        const whole = audioBlock(source, m, 0, Math.round(m.outputDuration * 4000), 4000);
        const parts = new Float32Array(whole.length);
        for (let at = 0; at < whole.length; at += 317)
            parts.set(audioBlock(source, m, at, Math.min(317, whole.length - at), 4000), at);
        expect(Array.from(parts)).toEqual(Array.from(whole));
    });
});
