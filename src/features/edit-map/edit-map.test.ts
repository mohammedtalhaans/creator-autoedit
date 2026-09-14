import { describe, it, expect } from 'vitest';
import { EditMap, renderClock } from './index';
const cut = (start: number, end: number, enabled = true) => ({ id: `${start}`, start, end, enabled });
describe('canonical edit decision map', () => {
    it('preserves an uncut project', () => {
        const m = EditMap.fromCuts(10, []);
        expect(m.outputDuration).toBe(10);
        for (let i = 0; i <= 10; i += .1)
            expect(m.outputTimeToSourceTime(m.sourceTimeToOutputTime(i))).toBeCloseTo(i, 8);
    });
    it('removes one pause', () => { const m = EditMap.fromCuts(10, [cut(2, 4)]); expect(m.outputDuration).toBe(8); expect(m.sourceTimeToOutputTime(5)).toBe(3); expect(m.outputTimeToSourceTime(3)).toBe(5); });
    it('merges overlapping and adjacent cuts', () => { const m = EditMap.fromCuts(10, [cut(2, 4), cut(3, 5), cut(5, 7)]); expect(m.outputDuration).toBe(5); expect(m.ranges).toHaveLength(2); });
    it('handles start and end cuts', () => { const m = EditMap.fromCuts(10, [cut(0, 2), cut(8, 10)]); expect(m.outputTimeToSourceTime(0)).toBe(2); expect(m.outputTimeToSourceTime(6)).toBe(8); expect(m.outputDuration).toBe(6); });
    it('a seam belongs to the next range', () => { const m = EditMap.fromCuts(10, [cut(2, 4)]); expect(m.outputTimeToSourceTime(2)).toBe(4); expect(m.isSourceTimeKept(2)).toBe(false); expect(m.isSourceTimeKept(4)).toBe(true); });
    it('clamps invalid ranges and ignores disabled cuts', () => { const m = EditMap.fromCuts(10, [cut(-5, 1), cut(9, 99), cut(2, 8, false)]); expect(m.outputDuration).toBe(8); });
    it('maps removed source time to a stable seam', () => { const m = EditMap.fromCuts(10, [cut(2, 4)]); expect(m.sourceTimeToOutputTime(2.8)).toBe(2); expect(m.removedDurationBefore(5)).toBe(2); expect(m.nextKeptSourceTime(3)).toBe(4); });
    it('does not invent words entirely inside removed pauses', () => { const m = EditMap.fromCuts(10, [cut(2, 4)]); expect(m.remapWord({ id: 'w', text: 'noise', start: 2.2, end: 3 })).toBeNull(); });
    it('trims words crossing either edge of a cut', () => { const m = EditMap.fromCuts(10, [cut(2, 4)]); expect(m.remapWord({ id: 'w', text: 'hello', start: 1.8, end: 4.2 })).toMatchObject({ start: 1.8, end: 2.2 }); });
    it('handles no kept media without NaN', () => { const m = EditMap.fromCuts(10, [cut(0, 10)]); expect(m.outputDuration).toBe(0); expect([...renderClock(m)]).toEqual([]); expect(m.outputTimeToSourceTime(1)).toBe(0); });
    it('normalizes unordered keep ranges', () => { const m = new EditMap(10, [{ sourceStart: 7, sourceEnd: 9 }, { sourceStart: 0, sourceEnd: 2 }, { sourceStart: 1, sourceEnd: 3 }]); expect(m.outputDuration).toBe(5); });
    it('has monotonic frame timestamps and no accumulated per-cut drift', () => {
        const cuts = Array.from({ length: 31 }, (_, i) => cut(i * 1.3 + .411, i * 1.3 + .689));
        const m = EditMap.fromCuts(50, cuts), clock = [...renderClock(m, 30)];
        expect(clock.at(-1)!.outputTime + clock.at(-1)!.duration).toBeCloseTo(m.outputDuration, 8);
        clock.forEach((f, i) => {
            expect(m.isSourceTimeKept(f.sourceTime)).toBe(true);
            if (i)
                expect(f.outputTime).toBeGreaterThan(clock[i - 1].outputTime);
        });
    });
    it('inverts 4,000 kept source times across many edits', () => {
        const m = EditMap.fromCuts(60, [cut(0, 1.2), cut(6.11, 8.98), cut(12, 14), cut(42.04, 45.02), cut(55, 60)]);
        for (let i = 0; i < 4000; i++) {
            const t = i * m.outputDuration / 4000;
            expect(m.sourceTimeToOutputTime(m.outputTimeToSourceTime(t))).toBeCloseTo(t, 8);
        }
    });
    it('rejects invalid durations', () => { expect(() => new EditMap(NaN, [])).toThrow(); expect(() => new EditMap(-1, [])).toThrow(); });
});
