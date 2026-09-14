/// <reference lib="webworker" />

import { resilientCache } from '../features/transcription/model'

const scope = self as DedicatedWorkerGlobalScope
const MODEL = 'onnx-community/moonshine-tiny-ONNX'
/** Pinned HF commit from the model API; update only with a reviewed model change. */
export const MOONSHINE_REVISION = 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95'
const CACHE_KEY = 'creator-autoedit-models-prompter-v1'

type TranscriptRequest = { type: 'prepare' | 'segment' | 'reset' | 'dispose'; base?: string; buffer?: Float32Array; isFinal?: boolean; epoch?: number }
type Transcriber = ((buffer: Float32Array) => Promise<{ text?: string }>) & { dispose?: () => Promise<void> }

let loadPromise: Promise<void> | null = null
let transcriber: Transcriber | null = null
let sessionEpoch = 0
let pendingPartial: { buffer: Float32Array; epoch: number } | null = null
let pendingFinals: Array<{ buffer: Float32Array; epoch: number }> = []
let pumping = false

async function prepare(base: string): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.useBrowserCache = false
    env.useFSCache = false
    try {
      env.customCache = resilientCache(await caches.open(CACHE_KEY))
      env.useCustomCache = true
    } catch { env.useCustomCache = false }
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = new URL('runtime/ort/', base).href
      env.backends.onnx.wasm.numThreads = 1
    }
    transcriber = await pipeline('automatic-speech-recognition', MODEL, {
      revision: MOONSHINE_REVISION,
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (progress: unknown) => scope.postMessage({ type: 'progress', progress }),
    }) as unknown as Transcriber
    await transcriber(new Float32Array(16_000))
    scope.postMessage({ type: 'ready', message: 'Voice-follow model ready' })
  })().catch((error) => {
    loadPromise = null
    scope.postMessage({ type: 'error', message: `Speech model failed: ${error instanceof Error ? error.message : String(error)}` })
    throw error
  })
  return loadPromise
}

async function transcribe(buffer: Float32Array, isFinal: boolean, requestEpoch: number): Promise<void> {
  if (!transcriber || requestEpoch !== sessionEpoch) return
  scope.postMessage({ type: 'status', status: 'transcribing', message: isFinal ? 'Catching up…' : 'Listening…' })
  try {
    const result = await transcriber(buffer)
    if (requestEpoch !== sessionEpoch) return
    const text = result.text?.trim() ?? ''
    if (text) scope.postMessage({ type: 'transcript', text, isFinal, epoch: requestEpoch })
  } catch (error) {
    if (requestEpoch === sessionEpoch) scope.postMessage({ type: 'warning', message: `Speech matching paused: ${error instanceof Error ? error.message : String(error)}` })
  } finally {
    if (requestEpoch === sessionEpoch) scope.postMessage({ type: 'status', status: 'recording', message: 'Listening…' })
  }
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (pendingFinals.length || pendingPartial) {
      const final = pendingFinals.shift()
      const partial = final ? undefined : pendingPartial
      if (!final && partial) pendingPartial = null
      if (final) await transcribe(final.buffer, true, final.epoch)
      else if (partial) await transcribe(partial.buffer, false, partial.epoch)
    }
  } finally { pumping = false }
}

function enqueuePartial(buffer: Float32Array, requestEpoch: number): void {
  pendingPartial = { buffer, epoch: requestEpoch }
  void pump()
}

scope.onmessage = (event: MessageEvent<TranscriptRequest>) => {
  const request = event.data
  if (request.type === 'prepare') void prepare(request.base ?? new URL('.', location.href).href)
  else if (request.type === 'reset') { sessionEpoch = request.epoch ?? sessionEpoch + 1; pendingPartial = null; pendingFinals = []; scope.postMessage({ type: 'reset', epoch: sessionEpoch }) }
  else if (request.type === 'dispose') {
    sessionEpoch++
    pendingPartial = null
    pendingFinals = []
    const model = transcriber
    transcriber = null
    loadPromise = null
    if (model?.dispose) void model.dispose()
    scope.postMessage({ type: 'disposed' })
  } else if (request.type === 'segment' && request.buffer) {
    const requestEpoch = request.epoch ?? sessionEpoch
    if (request.isFinal) {
      if (pendingFinals.length >= 2) {
        pendingFinals.shift()
        scope.postMessage({ type: 'warning', message: 'Speech catch-up skipped an old final; the latest phrase remains queued.', epoch: requestEpoch })
      }
      pendingFinals.push({ buffer: request.buffer, epoch: requestEpoch })
      void pump()
    } else enqueuePartial(request.buffer, requestEpoch)
  }
}
