import type { TaskState } from '../../types/project';
import { runWorker } from '../../lib/jobs';

export type SpeechVADSegment = { start: number; end: number; confidence?: number };
export type SpeechVADResult = { segments: SpeechVADSegment[]; probabilities: number[] };

/**
 * Main-thread adapter for the lazy, dedicated speech-vad worker. Keeping worker
 * creation here makes model loading cancellable and prevents UI components from
 * depending on worker protocol details.
 */
export function runSpeechVAD(audio: Float32Array, duration: number, base: string, signal: AbortSignal, onProgress: (state: Partial<TaskState>) => void): Promise<SpeechVADResult> {
    const copy = audio.slice();
    return runWorker<SpeechVADResult>(new Worker(new URL('../../workers/speech-vad.worker.ts', import.meta.url), { type: 'module' }), {
        type: 'analyze',
        audio: copy,
        duration,
        base,
    }, signal, onProgress, [copy.buffer]);
}

