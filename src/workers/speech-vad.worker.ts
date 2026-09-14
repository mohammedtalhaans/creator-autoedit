/// <reference lib="webworker" />

/**
 * Full-clip speech VAD adapted from the promptme-ai worker at
 * fe1de139b4266f5aac8edb9406c61a4ecf006d33. This worker keeps its own Silero
 * hidden state and receives a complete 16 kHz mono clip in 512-sample frames.
 * It is deliberately separate from ASR so a slow transcription model cannot
 * make pause boundaries drift.
 */
import { speechSegmentsFromProbabilities, type SpeechSegment } from '../features/silence';

const scope = self as DedicatedWorkerGlobalScope;
export const SPEECH_VAD_MODEL = 'onnx-community/silero-vad';
export const SPEECH_VAD_REVISION = 'e71cae966052b992a7eca6b17738916ce0eca4ec';
const SAMPLE_RATE = 16_000;
const FRAME_SIZE = 512;
const CONTEXT_SIZE = 64;

type RuntimeTensor = { data: Float32Array; dispose?: () => void };
type VadModel = (input: { input: RuntimeTensor; sr: RuntimeTensor; state: RuntimeTensor }) => Promise<{ stateN: RuntimeTensor; output: { data: Float32Array } }>;
let model: VadModel | null = null;
let sampleRateTensor: RuntimeTensor | null = null;
let hiddenState: RuntimeTensor | null = null;
let context = new Float32Array(CONTEXT_SIZE);
let loadPromise: Promise<void> | null = null;

async function prepare(base: string): Promise<void> {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        const { AutoModel, Tensor, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        const cacheEnv = env as unknown as { useWasmCache?: boolean; cacheKey?: string; experimental_useCrossOriginStorage?: boolean };
        cacheEnv.useWasmCache = true;
        cacheEnv.cacheKey = 'creator-autoedit-models-speech-vad-v1';
        cacheEnv.experimental_useCrossOriginStorage = false;
        if (env.backends.onnx.wasm) {
            // Keep ONNX Runtime same-origin and single-threaded; this avoids a
            // cross-origin isolation reload and limits phone CPU contention.
            env.backends.onnx.wasm.wasmPaths = new URL('runtime/ort/', base).href;
            env.backends.onnx.wasm.numThreads = 1;
        }
        model = await AutoModel.from_pretrained(SPEECH_VAD_MODEL, {
            revision: SPEECH_VAD_REVISION,
            config: { model_type: 'custom' } as never,
            dtype: 'fp32',
        }) as unknown as VadModel;
        sampleRateTensor = new Tensor('int64', [SAMPLE_RATE], []) as unknown as RuntimeTensor;
        hiddenState = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]) as unknown as RuntimeTensor;
    })();
    try {
        await loadPromise;
        scope.postMessage({ type: 'progress', detail: 'Speech model ready', progress: 0 });
    }
    catch (error) {
        loadPromise = null;
        throw error;
    }
}

function resetState(): void {
    hiddenState = null;
    context = new Float32Array(CONTEXT_SIZE);
}

async function probability(frame: Float32Array): Promise<number> {
    if (!model || !sampleRateTensor || !hiddenState)
        throw new Error('Speech model is not ready.');
    const { Tensor } = await import('@huggingface/transformers');
    const contextual = new Float32Array(CONTEXT_SIZE + FRAME_SIZE);
    contextual.set(context);
    contextual.set(frame, CONTEXT_SIZE);
    const input = new Tensor('float32', contextual, [1, contextual.length]) as unknown as RuntimeTensor;
    const result = await model({ input, sr: sampleRateTensor, state: hiddenState });
    hiddenState = result.stateN;
    context = contextual.slice(FRAME_SIZE);
    return result.output.data[0] ?? 0;
}

async function analyze(audio: Float32Array, duration: number, base: string): Promise<void> {
    if (!audio.length) {
        scope.postMessage({ type: 'result', value: { segments: [] as SpeechSegment[], probabilities: [] } });
        return;
    }
    await prepare(base);
    resetState();
    // Recreate a fresh hidden state for each full clip while keeping the model
    // cached and lazy across user retries.
    const { Tensor } = await import('@huggingface/transformers');
    hiddenState = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]) as unknown as RuntimeTensor;
    const probabilities: number[] = [];
    const totalFrames = Math.ceil(audio.length / FRAME_SIZE);
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const start = frameIndex * FRAME_SIZE;
        const frame = new Float32Array(FRAME_SIZE);
        frame.set(audio.subarray(start, Math.min(audio.length, start + FRAME_SIZE)));
        const score = await probability(frame);
        probabilities.push(score);
        if (frameIndex % 24 === 0 || frameIndex === totalFrames - 1)
            scope.postMessage({ type: 'progress', detail: 'Detecting spoken regions', progress: Math.min(1, (frameIndex + 1) / totalFrames) });
    }
    const segments = speechSegmentsFromProbabilities(probabilities, duration, { sampleRate: SAMPLE_RATE, frameSize: FRAME_SIZE, threshold: .50, exitThreshold: .35, minSilenceFrames: 2, minSpeechFrames: 3 });
    scope.postMessage({ type: 'result', value: { segments, probabilities } });
}

scope.onmessage = (event: MessageEvent<{ type: string; audio?: Float32Array; duration?: number; base?: string }>) => {
    const data = event.data;
    if (!data) return;
    if (data.type === 'analyze' && data.audio) {
        void analyze(data.audio, data.duration ?? data.audio.length / SAMPLE_RATE, data.base ?? new URL('.', location.href).href).catch(error => scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
    }
    else if (data.type === 'prepare') {
        void prepare(data.base ?? new URL('.', location.href).href).catch(error => scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
    }
};
