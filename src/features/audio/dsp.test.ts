import { describe, expect, it } from 'vitest';
import { audioBlock, makeWav, signalStats } from './dsp';
import { EditMap } from '../edit-map';

describe('source audio timing helpers', () => {
    it('reports finite source levels without changing the original PCM', () => {
        const input = Float32Array.from([.25, -.25, Number.NaN, Number.POSITIVE_INFINITY]);
        const stats = signalStats(input);
        expect(stats.rmsDb).toBeLessThan(0);
        expect(stats.peakDb).toBeCloseTo(-12.04, 1);
        expect(stats.denoised).toBe(false);
        expect(input[0]).toBe(.25);
    });

    it('keeps blocks split at a cut duration-neutral', () => {
        const rate = 48_000;
        const source = new Float32Array(rate * 3).fill(.5);
        const map = EditMap.fromCuts(3, [{ id: 'cut', start: 1, end: 2, enabled: true }]);
        const first = audioBlock(source, map, 0, rate, rate);
        const second = audioBlock(source, map, rate, rate, rate);
        expect(first).toHaveLength(rate);
        expect(second).toHaveLength(rate);
        expect(first.some(value => value !== 0)).toBe(true);
        expect(second.some(value => value !== 0)).toBe(true);
        expect(map.outputDuration).toBe(2);
    });

    it('creates a valid mono WAV without enhancement processing', async () => {
        const blob = makeWav(new Float32Array([0, .5, -.5]), 48_000);
        expect(blob.type).toBe('audio/wav');
        expect(blob.size).toBe(50);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
        expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    });
});
