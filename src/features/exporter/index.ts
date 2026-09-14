import { Input, BlobSource, ALL_FORMATS, CanvasSink, Output, Mp4OutputFormat, StreamTarget, CanvasSource, AudioSampleSource, AudioSample, Quality, canEncodeAudio } from 'mediabunny';
import type { Project, ExportResult, TaskState } from '../../types/project';
import { EditMap, renderClock } from '../edit-map';
import { projectCuts } from '../silence';
import { outputPhrases } from '../captions';
import { dimensions } from '../framing';
import { renderFrame, prepareFonts } from '../renderer';
import { AUDIO_RATE, audioBlock } from '../audio/dsp';
import { supportedAvc } from '../media/capabilities';
import { assertActive, yieldToBrowser } from '../../lib/utils';
import { validateExport } from './integrity';
import { PagedFile } from './paged-target';
export async function exportVideo(project: Project, pcm: Float32Array | null, constrained: boolean, signal: AbortSignal, onProgress: (state: Partial<TaskState>) => void): Promise<ExportResult> {
    const map = EditMap.fromCuts(project.metadata.duration, projectCuts(project));
    if (map.outputDuration < .1)
        throw new Error('Keep at least a moment of your video before exporting.');
    const { width, height } = dimensions(project.framing.ratio, project.exportConfig.quality, project.metadata);
    const codec = await supportedAvc(width, height);
    if (!codec)
        throw new Error('This device cannot encode this size. Choose Standard 720p and try again.');
    if (project.metadata.hasAudio && !pcm)
        throw new Error('The source audio is not ready. Retry audio analysis before exporting.');
    assertActive(signal);
    await prepareFonts();
    onProgress({ detail: 'Preparing your MP4', progress: undefined });
    const audioEncoding = { numberOfChannels: 1, sampleRate: AUDIO_RATE, quality: new Quality({ bitrate: 128000 }) };
    if (pcm && !(await canEncodeAudio('aac', audioEncoding))) {
        const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
        registerAacEncoder();
        if (!(await canEncodeAudio('aac', audioEncoding)))
            throw new Error('AAC audio encoding is unavailable on this device.');
    }
    const file = new PagedFile((constrained ? 112 : 320) * 1024 * 1024);
    const target = new StreamTarget(new WritableStream({ write(chunk: {
            data: Uint8Array;
            position: number;
        }) { assertActive(signal); file.write(chunk.data, chunk.position); } }));
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
    const input = new Input({ source: new BlobSource(project.source.file), formats: ALL_FORMATS });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    let cancelled = false;
    let cancelPromise: Promise<void> | null = null;
    const cancelOutput = () => {
        cancelPromise ??= output.cancel().catch(() => undefined);
        return cancelPromise;
    };
    const abort = () => { cancelled = true; input.dispose(); void cancelOutput(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx)
            throw new Error('The video drawing surface is unavailable.');
        const video = new CanvasSource(canvas, { codec: 'avc', fullCodecString: codec, quality: new Quality({ bitrate: project.exportConfig.quality === 1080 ? 5000000 : 2400000 }), latencyMode: 'realtime' });
        output.addVideoTrack(video, { frameRate: 30 });
        const audio = pcm ? new AudioSampleSource({ codec: 'aac', quality: new Quality({ bitrate: 128000 }) }) : null;
        if (audio)
            output.addAudioTrack(audio);
        assertActive(signal);
        const track = await input.getPrimaryVideoTrack();
        if (!track)
            throw new Error('The video track disappeared.');
        const firstTimestamp = await track.getFirstTimestamp();
        // A single pooled decode surface. Render at source resolution to retain vertical crop detail.
        const sink = new CanvasSink(track, { poolSize: 1 });
        const ticks = Array.from(renderClock(map, 30));
        const iterator = sink.canvasesAtTimestamps(ticks.map(t => Math.max(firstTimestamp, t.sourceTime)));
        const phrases = outputPhrases(project.words, map, project.captions.preset, project.captions);
        let frame = 0, audioWritten = 0;
        await output.start();
        for await (const decoded of iterator) {
            assertActive(signal);
            const tick = ticks[frame];
            if (!decoded)
                throw new Error(`A source frame could not be decoded at ${tick.sourceTime.toFixed(2)} seconds. No incomplete file was saved.`);
            assertActive(signal);
            renderFrame(ctx, decoded.canvas, decoded.canvas.width, decoded.canvas.height, width, height, project, map, phrases, tick.sourceTime);
            await video.add(tick.outputTime, tick.duration, { keyFrame: frame % 60 === 0 });
            if (audio && pcm) {
                const until = Math.round((tick.outputTime + tick.duration) * AUDIO_RATE);
                while (audioWritten < until) {
                    const count = Math.min(4096, until - audioWritten), data = audioBlock(pcm, map, audioWritten, count, AUDIO_RATE, project.audio.volume);
                    const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: 1, sampleRate: AUDIO_RATE, timestamp: audioWritten / AUDIO_RATE });
                    try {
                        await audio.add(sample);
                    }
                    finally {
                        sample.close();
                    }
                    audioWritten += count;
                }
            }
            frame++;
            if (frame % 3 === 0 || frame === ticks.length) {
                onProgress({ detail: 'Cutting · framing · rendering captions · encoding', progress: frame / ticks.length });
                await yieldToBrowser();
            }
        }
        if (frame !== ticks.length)
            throw new Error('The decoder ended before the video was complete.');
        video.close();
        audio?.close();
        onProgress({ detail: 'Finishing MP4', progress: undefined });
        await output.finalize();
        assertActive(signal);
        const blob = file.blob();
        file.clear();
        onProgress({ detail: 'Checking your finished file', progress: undefined });
        const check = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const cancelCheck = () => check.dispose();
        signal.addEventListener('abort', cancelCheck, { once: true });
        try {
            assertActive(signal);
            const v = await check.getPrimaryVideoTrack(), a = await check.getPrimaryAudioTrack();
            const duration = await check.computeDuration();
            validateExport({
                width: v ? await v.getDisplayWidth() : 0, height: v ? await v.getDisplayHeight() : 0,
                duration, bytes: blob.size,
                video: v ? { codec: await v.getCodec(), start: await v.getFirstTimestamp(), end: await v.computeDuration() } : null,
                audio: a ? { codec: await a.getCodec(), start: await a.getFirstTimestamp(), end: await a.computeDuration() } : null,
            }, { width, height, duration: map.outputDuration, audio: !!pcm });
            // Decode a small sample of the actual encoded output, not just its headers.
            if (!v || !(await v.canDecode()) || (a && !(await a.canDecode())))
                throw new Error('The encoded MP4 cannot be played back on this device. No incomplete file was saved.');
            const verification = new CanvasSink(v, { width: 160, poolSize: 1 });
            for (const at of [.02, map.outputDuration / 2, Math.max(0, map.outputDuration - .06)]) {
                assertActive(signal);
                if (!(await verification.getCanvas(Math.min(at, map.outputDuration - .001))))
                    throw new Error('An encoded video frame could not be verified. Please retry at Standard 720p.');
            }
        }
        finally {
            signal.removeEventListener('abort', cancelCheck);
            check.dispose();
        }
        assertActive(signal);
        return { blob, url: URL.createObjectURL(blob), name: project.source.name.replace(/\.[^.]+$/, '') + '-autoedit.mp4', width, height, duration: map.outputDuration, audio: !!audio, size: blob.size };
    }
    catch (error) {
        if (!cancelled)
            await cancelOutput();
        throw error;
    }
    finally {
        signal.removeEventListener('abort', abort);
        if (cancelled)
            await cancelOutput();
        input.dispose();
        canvas.width = canvas.height = 1;
        file.clear();
    }
}
