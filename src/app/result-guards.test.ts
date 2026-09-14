import { describe, expect, it } from 'vitest';
import { resolvedFraming, acceptsVoiceResult, mergeTask } from './result-guards';
import type { FramingConfig } from '../types/project';
const initial: FramingConfig = { ratio: 'vertical', mode: 'fill', x: .5, y: .5, zoom: 1, punch: true };
describe('Background result ownership', () => {
    it('uses the detected trajectory when the requested frame is still current', () => expect(resolvedFraming(initial, initial, true).mode).toBe('auto'));
    it('does not overwrite a manual crop with a late face result', () => {
        const manual = { ...initial, x: .7, zoom: 1.2 };
        expect(resolvedFraming(manual, initial, true)).toBe(manual);
    });
    it('does not overwrite Blur with a late face failure', () => {
        const manual = { ...initial, mode: 'blur' as const };
        expect(resolvedFraming(manual, initial, false)).toBe(manual);
    });
    it('only uses automatic center fallback when the frame has not changed', () => expect(resolvedFraming(initial, initial, false).mode).toBe('fill'));
    it('rejects outdated noise-reduction results', () => {
        expect(acceptsVoiceResult({ enabled: true, noise: 'strong', volume: 1 }, 'light')).toBe(false);
        expect(acceptsVoiceResult({ enabled: false, noise: 'light', volume: 1 }, 'light')).toBe(false);
        expect(acceptsVoiceResult({ enabled: true, noise: 'light', volume: .5 }, 'light')).toBe(true);
    });
    it('resets old progress and transfer sizes on retry', () => {
        expect(mergeTask({ status: 'done', detail: 'Complete', progress: 1, loaded: 100, total: 100 }, { status: 'running', detail: 'Retrying' })).toEqual({ status: 'running', detail: 'Retrying' });
    });
    it('retains measured progress within the same operation', () => {
        expect(mergeTask({ status: 'running', detail: 'Encoding', progress: .4 }, { detail: 'Rendering' }).progress).toBe(.4);
    });
});
