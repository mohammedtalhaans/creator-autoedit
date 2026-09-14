/// <reference lib="webworker" />
import { enhanceVoice, AUDIO_RATE } from '../features/audio-enhance/dsp';
import type { AudioConfig } from '../types/project';
const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<{
    pcm: Float32Array;
    config: AudioConfig;
}>) => {
    try {
        const dry = e.data.pcm;
        let audio = dry, denoised = false, warning: string | undefined;
        if (e.data.config.noise !== 'off') {
            try {
                scope.postMessage({ type: 'progress', detail: 'Preparing noise reduction' });
                const { Rnnoise } = await import('@shiguredo/rnnoise-wasm');
                const rn = await Rnnoise.load();
                const state = rn.createDenoiseState(), size = rn.frameSize, frame = new Float32Array(size);
                const wet = new Float32Array(dry.length + size * 2);
                try {
                    // RNNoise uses float samples in 16-bit PCM scale and has a one-frame analysis delay.
                    for (let at = 0; at < wet.length; at += size) {
                        for (let i = 0; i < size; i++)
                            frame[i] = (dry[at + i] ?? 0) * 32768;
                        state.processFrame(frame);
                        for (let i = 0; i < size && at + i < wet.length; i++)
                            wet[at + i] = frame[i] / 32768;
                        if (at % (size * 100) === 0)
                            scope.postMessage({ type: 'progress', detail: 'Reducing room noise', progress: at / wet.length });
                    }
                }
                finally {
                    state.destroy();
                }
                const mix = e.data.config.noise === 'strong' ? 1 : .55;
                audio = new Float32Array(dry.length);
                for (let i = 0; i < audio.length; i++)
                    audio[i] = dry[i] * (1 - mix) + (wet[i + size] ?? 0) * mix;
                denoised = true;
            }
            catch {
                warning = 'Noise reduction was unavailable. Voice filtering and level control are still applied.';
                audio = dry;
            }
        }
        scope.postMessage({ type: 'progress', detail: 'Balancing your voice' });
        const { pcm, stats } = enhanceVoice(audio, AUDIO_RATE);
        scope.postMessage({ type: 'result', value: { pcm, stats: { ...stats, denoised, warning } } }, [pcm.buffer]);
    }
    catch (error) {
        scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
