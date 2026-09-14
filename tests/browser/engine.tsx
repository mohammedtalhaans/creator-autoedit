/** Test-only Vite entry; not reachable from the production app and not included in dist. */
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, AudioSampleSink, CanvasSink } from 'mediabunny';
import { inspectVideo } from '../../src/features/media/ingest';
import { getCapabilities } from '../../src/features/media/capabilities';
import { exportVideo } from '../../src/features/exporter';
import { defaultCaptions } from '../../src/features/captions';
import { EditMap } from '../../src/features/edit-map';
import { projectCuts } from '../../src/features/silence';
import { runWorker } from '../../src/lib/jobs';
import { studio, type StudioState } from '../../src/app/store';
import App from '../../src/app/App';
import { realSpeech, realNoiseReduction, realFace } from './models';
import type { Project, WaveformData, Pause, AudioStats, ExportResult } from '../../src/types/project';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/barlow-condensed/800.css';
import '../../src/styles/globals.css';
let current: Project | null = null, pcm: Float32Array | null = null, rendered = false, last: ExportResult | null = null;
const controller = new AbortController();
async function prepare(noAudio = false) {
    const capabilities = await getCapabilities();
    if (!capabilities.decode || !capabilities.encode)
        return { supported: false, reason: capabilities.reason };
    const response = await fetch(new URL(noAudio ? '../fixtures/no-audio.mp4' : '../fixtures/tiny.mp4', import.meta.url));
    if (!response.ok)
        throw new Error('Test fixture unavailable');
    const file = new File([await response.blob()], 'fixture.mp4', { type: 'video/mp4' });
    const { source, metadata } = await inspectVideo(file, false, controller.signal);
    let analysis: {
        pcm: Float32Array;
        speech: Float32Array;
        waveform: WaveformData;
        pauses: Pause[];
        sourceStats: AudioStats;
    } | null = null;
    if (metadata.hasAudio)
        analysis = await runWorker(new Worker(new URL('../../src/workers/analysis.worker.ts', import.meta.url), { type: 'module' }), { file, duration: metadata.duration }, controller.signal, () => undefined);
    pcm = analysis?.pcm ?? null;
    // Expensive ASR/face inference is separately tested. These are explicit UI fixture timings, never production fallback output.
    const words = ['Your', 'best', 'ideas', 'deserve', 'to', 'be', 'heard.'].map((text, i) => ({ id: `fixture-${i}`, text, start: .5 + i * .3, end: .8 + i * .3 }));
    current = { id: 'test-fixture', source, metadata, waveform: analysis?.waveform ?? { peaks: [], rms: [], duration: metadata.duration, noiseFloorDb: -90, speechDb: -90, windowMs: 20 }, pauses: analysis?.pauses ?? [], overrides: {}, cutPreset: noAudio ? 'off' : 'natural', sensitivity: .5, words: noAudio ? [] : words, captions: { ...defaultCaptions, enabled: !noAudio, safe: { ...defaultCaptions.safe } }, audio: { enabled: false, noise: 'off', volume: 1 }, sourceAudioStats: analysis?.sourceStats, framing: { ratio: 'vertical', mode: 'fill', x: .5, y: .5, zoom: 1, punch: true }, faces: [], exportConfig: { quality: 720, fps: 30 } };
    const internals = studio as unknown as {
        emit: (p: Partial<StudioState>) => void;
        pcm: Float32Array | null;
    };
    internals.pcm = pcm;
    internals.emit({ stage: 'editor', project: current, capabilities });
    if (!rendered) {
        rendered = true;
        createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
    }
    return { supported: true, duration: metadata.duration, hasAudio: metadata.hasAudio };
}
async function inspect(result: ExportResult) {
    const input = new Input({ source: new BlobSource(result.blob), formats: ALL_FORMATS });
    try {
        const video = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack();
        if (!video)
            throw new Error('Missing video track');
        let lastVideo = -Infinity, videoEnd = 0, frames = 0;
        for await (const sample of new VideoSampleSink(video).samples()) {
            try {
                if (sample.timestamp < lastVideo)
                    throw new Error('Video timestamps are not monotonic');
                lastVideo = sample.timestamp;
                videoEnd = sample.timestamp + sample.duration;
                frames++;
            }
            finally {
                sample.close();
            }
        }
        let lastAudio = -Infinity, audioEnd = 0, samples = 0;
        if (audio)
            for await (const sample of new AudioSampleSink(audio).samples()) {
                try {
                    if (sample.timestamp < lastAudio)
                        throw new Error('Audio timestamps are not monotonic');
                    lastAudio = sample.timestamp;
                    audioEnd = sample.timestamp + sample.duration;
                    samples++;
                }
                finally {
                    sample.close();
                }
            }
        const sink = new CanvasSink(video, { width: 64, poolSize: 1 });
        let nonBlack = 0, checked = 0, captionPixels = 0;
        for await (const frame of sink.canvasesAtTimestamps([.2, .6, 1, 1.5]))
            if (frame) {
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 114;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(frame.canvas, 0, 0, 64, 114);
                const data = ctx.getImageData(0, 0, 64, 114).data;
                let total = 0;
                for (let i = 0; i < data.length; i += 4) {
                    total += data[i] + data[i + 1] + data[i + 2];
                    // Fixture captions use the configured cream/green palette. Count only the lower safe-zone band so bright source pixels do not stand in for text.
                    const y = Math.floor(i / 4 / 64);
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    if (y > 52 && ((r > 190 && g > 180 && b > 150) || (g > 190 && r > 120 && b < 150))) captionPixels++;
                }
                if (total / (64 * 114 * 3) > 8)
                    nonBlack++;
                checked++;
            }
        return { size: result.size, duration: await input.computeDuration(), width: await video.getDisplayWidth(), height: await video.getDisplayHeight(), videoCodec: await video.getCodec(), audioCodec: await audio?.getCodec() ?? null, frames, samples, videoEnd, audioEnd, checked, nonBlack, captionPixels, url: result.url };
    }
    finally {
        input.dispose();
    }
}
async function exportFixture(noAudio = false) {
    if (!current)
        await prepare(noAudio);
    if (!current)
        throw new Error('Encoder unsupported');
    const project = studio.getSnapshot().project ?? current;
    const map = EditMap.fromCuts(project.metadata.duration, projectCuts(project));
    last = await exportVideo(project, pcm, false, controller.signal, () => undefined);
    return { ...await inspect(last), expectedDuration: map.outputDuration };
}
declare global {
    interface Window {
        fixture: {
            realSpeech: typeof realSpeech;
            realNoiseReduction: typeof realNoiseReduction;
            realFace: typeof realFace;
            prepare: typeof prepare;
            exportFixture: typeof exportFixture;
            inspect: typeof inspect;
            cancel: () => void;
            project: () => Project | null;
        };
    }
}
window.fixture = { realSpeech, realNoiseReduction, realFace, prepare, exportFixture, inspect, cancel: () => controller.abort(), project: () => studio.getSnapshot().project };
