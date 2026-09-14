/// <reference lib="webworker" />

import { resilientCache } from '../features/transcription/model'

import type { Tensor } from '@huggingface/transformers'

const scope = self as DedicatedWorkerGlobalScope
const SAMPLE_RATE = 16_000
const FRAME_SIZE = 512
const MAX_QUEUED_FRAMES = 4
const MIN_SILENCE_SAMPLES = SAMPLE_RATE * 0.5
const MIN_SPEECH_SAMPLES = SAMPLE_RATE * 0.2
const SPEECH_THRESHOLD = 0.3
const EXIT_THRESHOLD = 0.08
const MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 30

let vad: ((input: Record<string, unknown>) => Promise<{ stateN: Tensor; output: { data: Float32Array } }>) | null = null
let sampleRateTensor: Tensor | null = null
let vadState: Tensor | null = null
let loading: Promise<void> | null = null
let speechBuffer: number[] = []
let preRoll: Float32Array[] = []
let postSilence = 0
let inSpeech = false
let stopped = false
let sessionEpoch = 0
const frameQueue: Float32Array[] = []
let frameRemainder = new Float32Array(0)
let processingFrames = false

function energy(frame: Float32Array): number {
  let total = 0
  for (const sample of frame) total += sample * sample
  return total / Math.max(1, frame.length)
}

async function prepare(base: string): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    const { AutoModel, Tensor: RuntimeTensor, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.useBrowserCache = false
    env.useFSCache = false
    try {
      env.customCache = resilientCache(await caches.open('creator-autoedit-models-prompter-v1'))
      env.useCustomCache = true
    } catch { env.useCustomCache = false }
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = new URL('runtime/ort/', base).href
      env.backends.onnx.wasm.numThreads = 1
    }
    vad = (await AutoModel.from_pretrained('onnx-community/silero-vad', { revision: 'e71cae966052b992a7eca6b17738916ce0eca4ec', config: { model_type: 'custom' } as unknown as import('@huggingface/transformers').PretrainedConfig, dtype: 'fp32' })) as typeof vad
    sampleRateTensor = new RuntimeTensor('int64', [SAMPLE_RATE], [])
    vadState = new RuntimeTensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128])
    scope.postMessage({ type: 'ready', message: 'Voice activity model ready' })
  })().catch((error) => {
    loading = null
    scope.postMessage({ type: 'error', message: `Voice activity model failed: ${error instanceof Error ? error.message : String(error)}` })
    throw error
  })
  return loading
}

async function speechProbability(frame: Float32Array): Promise<number> {
  if (!vad || !sampleRateTensor || !vadState) return energy(frame) > 1e-5 ? 1 : 0
  const input = new (await import('@huggingface/transformers')).Tensor('float32', frame, [1, frame.length])
  const result = await vad({ input, sr: sampleRateTensor, state: vadState })
  vadState = result.stateN
  return result.output.data[0] ?? 0
}

function reset(): void {
  speechBuffer = []
  preRoll = []
  postSilence = 0
  inSpeech = false
  frameQueue.length = 0
  frameRemainder = new Float32Array(0)
}

function emitSegment(isFinal: boolean): void {
  if (speechBuffer.length < MIN_SPEECH_SAMPLES) { reset(); return }
  const values = new Float32Array([...preRoll.flatMap((frame) => [...frame]), ...speechBuffer].slice(0, MAX_SEGMENT_SAMPLES))
  scope.postMessage({ type: 'segment', buffer: values, isFinal, epoch: sessionEpoch, audioMs: Math.round(values.length / SAMPLE_RATE * 1000), vadEmitTs: performance.now() }, [values.buffer])
  reset()
}

async function consume(frame: Float32Array, epochAtStart = sessionEpoch): Promise<void> {
  if (stopped) return
  const probability = await speechProbability(frame)
  if (epochAtStart !== sessionEpoch || stopped) return
  const active = probability > SPEECH_THRESHOLD || (inSpeech && probability >= EXIT_THRESHOLD)
  if (!inSpeech && !active) {
    preRoll.push(frame)
    if (preRoll.length > 4) preRoll.shift()
    return
  }
  if (active) {
    inSpeech = true
    postSilence = 0
    speechBuffer.push(...frame)
    if (speechBuffer.length >= MAX_SEGMENT_SAMPLES) emitSegment(true)
    return
  }
  speechBuffer.push(...frame)
  postSilence += frame.length
  if (postSilence >= MIN_SILENCE_SAMPLES) emitSegment(true)
}

function enqueuePcm(input: Float32Array): void {
  if (stopped) return
  const combined = new Float32Array(frameRemainder.length + input.length)
  combined.set(frameRemainder)
  combined.set(input, frameRemainder.length)
  let offset = 0
  while (offset + FRAME_SIZE <= combined.length) {
    if (frameQueue.length >= MAX_QUEUED_FRAMES) {
      frameQueue.shift()
      scope.postMessage({ type: 'warning', message: 'Voice activity processing fell behind; an old audio frame was skipped.', epoch: sessionEpoch })
    }
    frameQueue.push(combined.slice(offset, offset + FRAME_SIZE))
    offset += FRAME_SIZE
  }
  frameRemainder = combined.slice(offset)
  void pumpFrames()
}

async function pumpFrames(): Promise<void> {
  if (processingFrames) return
  processingFrames = true
  try {
    while (frameQueue.length && !stopped) {
      const frame = frameQueue.shift()
      if (frame) await consume(frame)
    }
  } finally { processingFrames = false }
}

scope.onmessage = (event: MessageEvent<{ type: string; base?: string; buffer?: Float32Array }>) => {
  const data = event.data
  if (data.type === 'prepare') void prepare(data.base ?? new URL('.', location.href).href)
  else if (data.type === 'reset') { sessionEpoch = Number((data as { epoch?: number }).epoch ?? sessionEpoch + 1); stopped = false; reset(); scope.postMessage({ type: 'reset', epoch: sessionEpoch }) }
  else if (data.type === 'stop') { stopped = true; if (speechBuffer.length) emitSegment(true); reset() }
  else if (data.type === 'frame' && data.buffer) enqueuePcm(data.buffer)
}
