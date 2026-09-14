import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioStats, Metadata, SourceMedia } from '../types/project';

const { inspectVideoMock, runSpeechVADMock, runWorkerMock } = vi.hoisted(() => ({ inspectVideoMock: vi.fn(), runSpeechVADMock: vi.fn(), runWorkerMock: vi.fn() }));

vi.mock('../features/media/ingest', () => ({ inspectVideo: inspectVideoMock }));
vi.mock('../features/voice-detection', () => ({ runSpeechVAD: runSpeechVADMock }));
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
const audioResult = { pcm: new Float32Array(16_000), speech: new Float32Array(16_000), waveform: { peaks: [0], rms: [0], duration: 3, windowMs: 20, noiseFloorDb: -90, speechDb: -18 }, pauses: [{ id: 'energy-gap', start: 1, end: 2, confidence: 1 }], sourceStats: audioStats };

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
        runSpeechVADMock.mockResolvedValue({ segments: [{ start: .2, end: 2.8, confidence: .92 }], probabilities: [] });
    });

    it('centralizes speech-aware Tight and original framing defaults', () => {
        expect(defaultCutConfig(true, 'tight')).toEqual({ detector: 'speech', minPause: .064, padding: .01 });
        expect(defaultCutConfig(true, 'jump')).toEqual({ detector: 'speech', minPause: .064, padding: 0 });
        expect(defaultFraming()).toEqual({ ratio: 'original', mode: 'fit', x: .5, y: .5, zoom: 1, punch: false });
    });

    it('ingests audio with only decode/audio analysis plus speech VAD', async () => {
        const store = new StudioStore();
        const enhance = vi.spyOn(store, 'enhance');
        const frame = vi.spyOn(store, 'frame');
        const transcribe = vi.spyOn(store, 'transcribe');
        await store.ingest(source.file);
        const project = store.getSnapshot().project!;
        expect(project.cutPreset).toBe('tight');
        expect(project.cutConfig).toEqual({ detector: 'speech', minPause: .064, padding: .01 });
        expect(project.captions.enabled).toBe(false);
        expect(project.audio).toEqual({ enabled: false, noise: 'off', volume: 1 });
        expect(project.framing).toEqual(defaultFraming());
        expect(project.faces).toEqual([]);
        expect(project.metadata.width).toBe(1920);
        expect(project.metadata.height).toBe(1080);
        expect(project.speechSegments).toEqual([{ start: .2, end: 2.8, confidence: .92 }]);
        expect(project.speechStatus?.status).toBe('ready');
        expect(runWorkerMock).toHaveBeenCalledTimes(1);
        expect(runSpeechVADMock).toHaveBeenCalledTimes(1);
        expect(enhance).not.toHaveBeenCalled();
        expect(frame).not.toHaveBeenCalled();
        expect(transcribe).not.toHaveBeenCalled();
        expect(store.getSnapshot().tasks.face.status).toBe('idle');
        expect(store.getSnapshot().tasks.voice.status).toBe('idle');
        expect(store.getSnapshot().tasks.captions.status).toBe('idle');
    });

    it('does not cut by energy when the default speech detector fails', async () => {
        runSpeechVADMock.mockRejectedValueOnce(new Error('model unavailable'));
        const store = new StudioStore();
        await store.ingest(source.file);
        const project = store.getSnapshot().project!;
        expect(project.speechStatus?.status).toBe('error');
        expect(project.speechStatus?.detail).toContain('original kept');
        expect(store.cuts()).toEqual([]);
        expect(store.getSnapshot().tasks.pauses.status).toBe('error');
    });

    it('resets AutoEdit to neutral defaults without re-enabling heavy modules', async () => {
        const store = new StudioStore();
        await store.ingest(source.file);
        const before = store.getSnapshot().project!;
        const correctedWords = [{ id: 'corrected', text: 'corrected', start: 0, end: .3 }];
        store.patch({ captions: { ...before.captions, enabled: true }, audio: { enabled: true, noise: 'strong', volume: .7 }, framing: { ratio: 'vertical', mode: 'auto', x: .7, y: .4, zoom: 1.4, punch: true }, words: correctedWords });
        const enhance = vi.spyOn(store, 'enhance');
        store.autoEdit();
        const project = store.getSnapshot().project!;
        expect(project.cutPreset).toBe('tight');
        expect(project.cutConfig).toEqual({ detector: 'speech', minPause: .064, padding: .01 });
        expect(project.captions.enabled).toBe(false);
        expect(project.audio).toEqual({ enabled: false, noise: 'off', volume: 1 });
        expect(project.framing).toEqual(defaultFraming());
        expect(project.words).toEqual(correctedWords);
        expect(project.speechSegments).toEqual(before.speechSegments);
        expect(enhance).not.toHaveBeenCalled();
    });
});
