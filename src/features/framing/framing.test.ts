import { describe, it, expect } from 'vitest';
import { dimensions, cropRect, smoothFaces, faceAt } from './index';
const base = { ratio: 'vertical' as const, mode: 'auto' as const, x: .5, y: .5, zoom: 1, punch: true };
describe('framing geometry', () => {
    it('produces exact social dimensions', () => { expect(dimensions('vertical', 1080, { width: 3840, height: 2160 })).toEqual({ width: 1080, height: 1920 }); expect(dimensions('vertical', 720, { width: 1920, height: 1080 })).toEqual({ width: 720, height: 1280 }); });
    it('never samples outside source bounds', () => {
        for (const x of [0, .2, .5, .9, 1]) {
            const r = cropRect(1920, 1080, 720, 1280, base, { x, y: .3 });
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x + r.width).toBeLessThanOrEqual(1920.00001);
            expect(r.y + r.height).toBeLessThanOrEqual(1080.00001);
        }
    });
    it('actual face position changes horizontal crop', () => { expect(cropRect(1920, 1080, 720, 1280, base, { x: .8, y: .3 }).x).toBeGreaterThan(cropRect(1920, 1080, 720, 1280, base, { x: .2, y: .3 }).x); });
    it('holds framing through missed detections', () => { const s = smoothFaces([{ time: 0, x: .7, y: .3, confidence: .99 }, { time: .5, x: .5, y: .5, confidence: 0 }]); expect(s[1].x).toBe(.7); });
    it('bounds trajectory velocity', () => { const s = smoothFaces([{ time: 0, x: .2, y: .3, confidence: .99 }, { time: .5, x: .9, y: .3, confidence: .99 }]); expect(s[1].x - s[0].x).toBeLessThanOrEqual(.18 * .5); });
    it('interpolates source-time positions', () => { expect(faceAt([{ time: 0, x: .2, y: .3, confidence: 1 }, { time: 1, x: .8, y: .3, confidence: 1 }], .5).x).toBeCloseTo(.5); });
    it('keeps original output dimensions even', () => { const d = dimensions('original', 720, { width: 4031, height: 2161 }); expect(d.width % 2).toBe(0); expect(d.height % 2).toBe(0); });
});
