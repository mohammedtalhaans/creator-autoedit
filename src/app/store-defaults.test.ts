import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioStats, Metadata, SourceMedia } from '../types/project';

const { inspectVideoMock, runWorkerMock } = vi.hoisted(() => ({ inspectVideoMock: vi.fn(), runWorkerMock: vi.fn() }));
vi.mock('../features/media/ingest', () => ({ inspectVideo: inspectVideoMock }));
vi.mock('../lib/jobs', () => {
    class Jobs {
        private readonly active = new Map<string, AbortController>();
        start(name: string) { this.cancel(name); const controller = new AbortController(); this.active.set(name, controller); return controller.signal; }
        cancel(name: string) { this.active.get(name)?.abort(); this.active.delete(name); }
        cancelAll() { for (const controller of this.active.values()) controller.abort(); this.active.clear(); }
        finish(name: string, signal: AbortSignal) { if (this.active.get(name)?.signal === signal) this.active.delete(name); }
    }
    return { Jobs, runWorker: runWorkerMock };
});

import { StudioStore, defaultCutConfig, defaultFraming } from './store';

const metadata: Metadata = { duration: 3, width: 1920, height: 1080, fps: 29.97, size: 1234, videoCodec: 'avc1', audioCodec: 'mp4a', hasAudio: true, hdr: false };
const source: SourceMedia = { file: new File(['video'], 'fixture.mp4', { type: 'video/mp4' }), name: 'fixture.mp4', url: 'blob:fixture', thumbnail: '' };
const audioStats: AudioStats = { rmsDb: -18, peakDb: -2, gainDb: 0, denoised: false };
const audioResult = { pcm: new Float32Array(48_000), waveform: { peaks: [0], rms: [0], duration: 3, windowMs: 20, noiseFloorDb: -90, activityDb: -18 }, pauses: [{ id: 'energy-gap', start: 1, end: 2, confidence: 1 }], sourceStats: audioStats };

function installWorkerStub() {
    class WorkerStub { terminate() {} postMessage() {} }
    globalThis.Worker = WorkerStub as unknown as typeof Worker;
}

describe('Studio defaults', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installWorkerStub();
        inspectVideoMock.mockResolvedValue({ source, metadata });
        runWorkerMock.mockResolvedValue(audioResult);
    });

    it('centralizes conservative audio handles and original framing defaults', () => {
        expect(defaultCutConfig(true, 'tight')).toEqual({ detector: 'audio', minPause: .22, afterSpeechPadding: .04, beforeSpeechPadding: .12 });
        expect(defaultCutConfig(true, 'jump')).toEqual({ detector: 'audio', minPause: .1, afterSpeechPadding: .01, beforeSpeechPadding: .09 });
        expect(defaultFraming()).toEqual({ ratio: 'original', mode: 'fit', x: .5, y: .5, zoom: 1, punch: false });
    });

    it('ingests metadata and deterministic audio only before opening the editor', async () => {
        const store = new StudioStore();
        await store.ingest(source.file);
        const project = store.getSnapshot().project!;
        expect(store.getSnapshot().stage).toBe('editor');
        expect(project.cutPreset).toBe('tight');
        expect(project.cutConfig).toEqual(defaultCutConfig(true, 'tight'));
        expect(project.cutAdjustments).toEqual({});
        expect(project.captions.enabled).toBe(false);
        expect(project.audio).toEqual({ enabled: false, noise: 'off', volume: 1 });
        expect(project.framing).toEqual(defaultFraming());
        expect(project.faces).toEqual([]);
        expect(project.metadata.width).toBe(1920);
        expect(project.metadata.height).toBe(1080);
        expect(project.speechSegments).toBeUndefined();
        expect(runWorkerMock).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().tasks.audio.status).toBe('done');
        expect(store.getSnapshot().tasks.pauses.status).toBe('done');
    });

    it('keeps no-audio projects exportable and disables only the audio pass', async () => {
        inspectVideoMock.mockResolvedValueOnce({ source, metadata: { ...metadata, hasAudio: false, audioCodec: null } });
        const store = new StudioStore();
        await store.ingest(source.file);
        const project = store.getSnapshot().project!;
        expect(project.cutPreset).toBe('off');
        expect(store.getSnapshot().tasks.audio.status).toBe('cancelled');
        expect(store.getSnapshot().tasks.pauses.status).toBe('cancelled');
        expect(runWorkerMock).not.toHaveBeenCalled();
    });

    it('applies AutoCut reset without enabling captions, audio processing or effects', async () => {
        const store = new StudioStore();
        await store.ingest(source.file);
        const before = store.getSnapshot().project!;
        const words = [{ id: 'manual', text: 'manual', start: 0, end: .3 }];
        store.patch({ captions: { ...before.captions, enabled: true }, audio: { enabled: true, noise: 'strong', volume: .7 }, framing: { ratio: 'vertical', mode: 'fill', x: .7, y: .4, zoom: 1.4, punch: true }, words, cutAdjustments: { 'energy-gap': { startDelta: .2, endDelta: -.2 } } });
        store.autoEdit();
        const project = store.getSnapshot().project!;
        expect(project.cutConfig).toEqual(defaultCutConfig(true, 'tight'));
        expect(project.captions.enabled).toBe(false);
        expect(project.audio).toEqual({ enabled: false, noise: 'off', volume: 1 });
        expect(project.framing).toEqual(defaultFraming());
        expect(project.cutAdjustments).toEqual({});
        expect(project.words).toEqual(words);
    });

    it('persists manual cut boundary adjustments across store updates', async () => {
        const store = new StudioStore();
        await store.ingest(source.file);
        store.setCutAdjustments('energy-gap', { startDelta: .05, endDelta: -.05 });
        expect(store.getSnapshot().project?.cutAdjustments['energy-gap'].startDelta).toBeCloseTo(.05, 3);
        expect(store.getSnapshot().project?.cutAdjustments['energy-gap'].endDelta).toBeCloseTo(-.05, 3);
        const adjusted = store.cuts().find(cut => cut.id === 'energy-gap');
        expect(adjusted?.start).toBeCloseTo(1.09, 3);
        expect(adjusted?.end).toBeCloseTo(1.83, 3);
        store.resetCuts();
        expect(store.getSnapshot().project?.cutAdjustments).toEqual({});
    });
});
