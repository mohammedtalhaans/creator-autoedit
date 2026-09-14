import { describe, expect, it } from 'vitest';
import { dragCrop } from './index';
import type { FramingConfig } from '../../types/project';
const config: FramingConfig = { ratio: 'vertical', mode: 'fill', zoom: 1, x: .5, y: .5, punch: false };
describe('Tactile manual framing', () => {
    it('moves exactly one source crop fraction for a landscape drag', () => {
        const result = dragCrop(1920, 1080, 360, 640, config, 36, 0);
        expect(result.x).toBeCloseTo(.5 - .1 * (1080 * 9 / 16) / 1920, 8);
        expect(result.y).toBe(.5);
    });
    it('accounts for zoom instead of using a magic drag multiplier', () => {
        const result = dragCrop(1920, 1080, 360, 640, { ...config, zoom: 2 }, 36, 64);
        expect(result.x).toBeCloseTo(.5 - .1 * (1080 * 9 / 16 / 2) / 1920, 8);
        expect(result.y).toBeCloseTo(.45, 8);
    });
    it('does not allow panning an uncropped portrait out of its frame', () => {
        expect(dragCrop(1080, 1920, 360, 640, config, 300, -200)).toEqual({ x: .5, y: .5 });
    });
    it('hands off automatic tracking at the visible subject position', () => {
        const result = dragCrop(1920, 1080, 360, 640, { ...config, mode: 'auto' }, 0, 0, { x: .7, y: .3 });
        expect(result.x).toBeCloseTo(.7, 8);
    });
    it('clamps to visible crop bounds without hidden over-drag', () => {
        const result = dragCrop(1920, 1080, 360, 640, config, 10000, 10000);
        expect(result.x).toBeCloseTo((1080 * 9 / 16) / (2 * 1920), 8);
        expect(result.y).toBe(.5);
    });
    it('fails safely while the preview has no layout size', () => expect(dragCrop(1920, 1080, 0, 0, config, 2, 2)).toEqual({ x: .5, y: .5 }));
});
