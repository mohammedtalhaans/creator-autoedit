/// <reference lib="webworker" />
import { SPEECH_MODEL, SPEECH_REVISION, MODEL_CACHE, resilientCache } from '../features/transcription/model';
import { normalizeChunks } from '../features/captions';
import type { TranscriptWord } from '../types/project';
const scope = self as DedicatedWorkerGlobalScope;
const MODEL = SPEECH_MODEL;
const CACHE = MODEL_CACHE;
export type SpeechRequest = {
    audio: Float32Array;
    base: string;
    gpu: boolean;
};
scope.onmessage = async (e: MessageEvent<SpeechRequest>) => {
    try {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        env.useBrowserCache = false;
        try {
            env.customCache = resilientCache(await caches.open(CACHE));
            env.useCustomCache = true;
        }
        catch {
            env.useCustomCache = false;
        }
        if (env.backends.onnx.wasm) {
            env.backends.onnx.wasm.wasmPaths = new URL('runtime/ort/', e.data.base).href;
            env.backends.onnx.wasm.numThreads = 1;
        }
        const report = (p: unknown) => {
            const item = p as {
                status?: string;
                file?: string;
                loaded?: number;
                total?: number;
            };
            scope.postMessage({ type: 'progress', detail: item.status === 'progress' ? 'Downloading local speech model — one-time setup' : 'Preparing captions', loaded: item.loaded, total: item.total });
        };
        const load = async (gpu: boolean) => pipeline('automatic-speech-recognition', MODEL, { revision: SPEECH_REVISION, device: gpu ? 'webgpu' : 'wasm', dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8', progress_callback: report });
        let accelerated = e.data.gpu, asr;
        try {
            asr = await load(accelerated);
        }
        catch {
            accelerated = false;
            asr = await load(false);
        }
        const words: TranscriptWord[] = [];
        const duration = e.data.audio.length / 16000, core = 24, overlap = 2;
        try {
            for (let start = 0; start < duration; start += core) {
                const a = Math.max(0, start - overlap), b = Math.min(duration, start + core + overlap);
                const segment = e.data.audio.subarray(Math.round(a * 16000), Math.round(b * 16000));
                scope.postMessage({ type: 'progress', detail: accelerated ? 'Building captions · accelerated locally' : 'Building captions · processing locally', progress: start / duration });
                let result;
                try {
                    result = await asr(segment, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
                }
                catch (error) {
                    if (!accelerated)
                        throw error;
                    await asr.dispose();
                    accelerated = false;
                    asr = await load(false);
                    result = await asr(segment, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
                }
                const single = Array.isArray(result) ? result[0] : result;
                const normalized = normalizeChunks(single.chunks ?? [], b - a, a);
                for (const w of normalized) {
                    const midpoint = (w.start + w.end) / 2;
                    if (midpoint >= start && midpoint < Math.min(duration, start + core))
                        words.push({ ...w, id: `w-${words.length}` });
                }
                scope.postMessage({ type: 'progress', detail: `${words.length} words found · ${accelerated ? 'accelerated locally' : 'processing locally'}`, progress: Math.min(1, (start + core) / duration) });
            }
        }
        finally {
            await asr.dispose();
        }
        // Remove invalid overlap edges but never invent speech.
        words.sort((a, b) => a.start - b.start);
        for (let i = 0; i < words.length; i++) {
            words[i].start = Math.max(0, Math.min(duration, words[i].start));
            words[i].end = Math.min(duration, Math.max(words[i].start + .02, words[i].end));
            if (i && words[i - 1].end > words[i].start)
                words[i - 1].end = words[i].start;
        }
        scope.postMessage({ type: 'result', value: { words, accelerated } });
    }
    catch (error) {
        scope.postMessage({ type: 'error', message: `Captions couldn’t be generated. ${error instanceof Error ? error.message : String(error)}` });
    }
};
