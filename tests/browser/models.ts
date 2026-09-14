/** Opt-in tests: actual model downloads and inference; no production fallback transcripts. */
import { runWorker } from '../../src/lib/jobs';
import type { AudioStats, FacePoint, TranscriptWord } from '../../src/types/project';
async function audioFixture(signal: AbortSignal) {
    const response = await fetch(new URL('../fixtures/tiny.mp4', import.meta.url));
    if (!response.ok) throw new Error('Speech fixture unavailable');
    return runWorker<{ pcm: Float32Array; speech: Float32Array }>(
        new Worker(new URL('../../src/workers/analysis.worker.ts', import.meta.url), { type: 'module' }),
        { file: new File([await response.blob()], 'speech-fixture.mp4'), duration: 6 }, signal, () => undefined);
}
export async function realSpeech() {
    const signal = AbortSignal.timeout(15 * 60_000);
    const { speech } = await audioFixture(signal);
    return runWorker<{ words: TranscriptWord[]; accelerated: boolean }>(
        new Worker(new URL('../../src/workers/transcription.worker.ts', import.meta.url), { type: 'module' }),
        { audio: speech, base: new URL(import.meta.env.BASE_URL, location.origin).href, gpu: false }, signal, () => undefined, [speech.buffer]);
}
export async function realNoiseReduction() {
    const signal = AbortSignal.timeout(120_000);
    const { pcm } = await audioFixture(signal);
    const original = pcm.slice();
    const result = await runWorker<{ pcm: Float32Array; stats: AudioStats }>(
        new Worker(new URL('../../src/workers/voice.worker.ts', import.meta.url), { type: 'module' }),
        { pcm, config: { enabled: true, noise: 'light', volume: 1 } }, signal, () => undefined, [pcm.buffer]);
    let difference = 0, peak = 0, finite = true;
    for (let i = 0; i < result.pcm.length; i++) {
        difference += Math.abs(result.pcm[i] - original[i]); peak = Math.max(peak, Math.abs(result.pcm[i])); finite &&= Number.isFinite(result.pcm[i]);
    }
    return { ...result.stats, difference: difference / original.length, peak, finite, length: result.pcm.length, originalLength: original.length };
}
export async function realFace() {
    const response = await fetch(new URL('../fixtures/face-astronaut.png', import.meta.url));
    if (!response.ok) throw new Error('Face fixture unavailable');
    const image = await createImageBitmap(await response.blob());
    const worker = new Worker(new URL('../../src/workers/face.worker.ts', import.meta.url), { type: 'module' });
    const exchange = (data: unknown, transfer: Transferable[] = []) => new Promise<{ type: string; point?: FacePoint; message?: string }>((resolve, reject) => {
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Face model timed out')); }, 120_000);
        const done = () => { clearTimeout(timer); worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; };
        worker.onmessage = e => {
            done();
            if (e.data.type === 'error') reject(new Error(e.data.message));
            else resolve(e.data);
        };
        worker.onerror = e => { done(); reject(new Error(e.message)); };
        worker.onmessageerror = () => { done(); reject(new Error('Invalid face-worker reply')); };
        try { worker.postMessage(data, transfer); } catch (error) { done(); reject(error); }
    });
    try {
        await exchange({ type: 'init', base: new URL(import.meta.env.BASE_URL, location.origin).href });
        const points: FacePoint[] = [];
        for (let i = 0; i < 3; i++) {
            const canvas = new OffscreenCanvas(768, 512), ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#17191c'; ctx.fillRect(0, 0, 768, 512); ctx.drawImage(image, i * 128, 0, 512, 512);
            const bitmap = canvas.transferToImageBitmap();
            const time = i * .5;
            try { const reply = await exchange({ type: 'frame', bitmap, time }, [bitmap]); if (reply.point) points.push(reply.point); }
            finally { bitmap.close(); }
        }
        return points;
    } finally { image.close(); worker.terminate(); }
}
