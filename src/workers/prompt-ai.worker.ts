/// <reference lib="webworker" />

import { resilientCache } from '../features/transcription/model'

const scope = self as DedicatedWorkerGlobalScope
const MODEL = 'onnx-community/SmolLM2-135M-Instruct-ONNX'
/** Pinned HF commit from the model API; generation stays optional and local. */
export const SMOLLM_REVISION = 'b8a5c0f183b78c55955a5364f610c36668b5e681'
const CACHE_KEY = 'creator-autoedit-models-prompter-v1'

type Generator = ((prompt: string, options: Record<string, unknown>) => Promise<Array<{ generated_text?: string }> | { generated_text?: string }>) & { dispose?: () => Promise<void> }
let generator: Generator | null = null
let loading: Promise<void> | null = null
let activeRequest = 0

async function prepare(base: string): Promise<void> {
  if (loading) return loading
  loading = (async () => {
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
    generator = await pipeline('text-generation', MODEL, {
      revision: SMOLLM_REVISION,
      device: 'wasm',
      dtype: 'q4',
      progress_callback: (progress: unknown) => scope.postMessage({ type: 'progress', progress }),
    }) as unknown as Generator
    scope.postMessage({ type: 'ready', message: 'Local writing model ready' })
  })().catch((error) => {
    loading = null
    scope.postMessage({ type: 'error', message: `Local writing model failed: ${error instanceof Error ? error.message : String(error)}` })
    throw error
  })
  return loading
}

scope.onmessage = (event: MessageEvent<{ type: string; base?: string; requestId?: number; prompt?: string; maxNewTokens?: number }>) => {
  const request = event.data
  if (request.type === 'prepare') void prepare(request.base ?? new URL('.', location.href).href)
  else if (request.type === 'cancel') activeRequest++
  else if (request.type === 'generate' && request.prompt) {
    const requestId = request.requestId ?? ++activeRequest
    activeRequest = requestId
    void (async () => {
      if (!generator) await prepare(new URL('.', location.href).href)
      if (!generator || requestId !== activeRequest) return
      try {
        const result = await generator(request.prompt!, { max_new_tokens: Math.min(320, Math.max(32, request.maxNewTokens ?? 180)), do_sample: false, return_full_text: false })
        if (requestId !== activeRequest) return
        const first = Array.isArray(result) ? result[0] : result
        scope.postMessage({ type: 'result', requestId, text: first?.generated_text?.trim() ?? '' })
      } catch (error) {
        if (requestId === activeRequest) scope.postMessage({ type: 'error', requestId, message: error instanceof Error ? error.message : String(error) })
      }
    })()
  }
}
