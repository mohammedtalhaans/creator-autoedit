export interface WritingDraftOptions {
  instruction?: string
  maxNewTokens?: number
  timeoutMs?: number
  onProgress?: (progress: unknown) => void
}

/** Optional on-device rewrite helper. It never mutates the source document. */
export class LocalWritingController {
  private worker: Worker | null = null
  private ready = false
  private prepareError: Error | null = null
  private prepareToken = 0
  private pending = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void; timer: number }>()
  private nextId = 0

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../../workers/prompt-ai.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ type: string; requestId?: number; text?: string; message?: string; progress?: unknown }>) => {
      const data = event.data
      if (data.type === 'ready') { this.ready = true; this.prepareError = null; return }
      if (data.type === 'progress') return
      if (!data.requestId) {
        if (data.type === 'error') this.prepareError = new Error(data.message ?? 'Local writing model failed.')
        return
      }
      const request = this.pending.get(data.requestId)
      if (!request) return
      window.clearTimeout(request.timer)
      this.pending.delete(data.requestId)
      if (data.type === 'result') request.resolve(data.text ?? '')
      else request.reject(new Error(data.message ?? 'Local writing model failed.'))
    }
    worker.onerror = () => { this.ready = false }
    this.worker = worker
    return worker
  }

  async prepare(onProgress?: (progress: unknown) => void): Promise<void> {
    const worker = this.ensureWorker()
    if (this.ready) return
    this.prepareError = null
    const token = ++this.prepareToken
    const base = new URL(import.meta.env.BASE_URL, location.origin).href
    worker.postMessage({ type: 'prepare', base })
    const started = Date.now()
    while (!this.ready) {
      if (token !== this.prepareToken) throw new Error('Draft cancelled.')
      if (this.prepareError) throw this.prepareError
      if (Date.now() - started > 180_000) throw new Error('Local writing model took too long to prepare. You can keep editing without it.')
      onProgress?.({ elapsed: Date.now() - started })
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80))
    }
  }

  async generate(source: string, options: WritingDraftOptions = {}): Promise<string> {
    if (source.trim().length < 8) throw new Error('Add a little more script before generating a rewrite.')
    await this.prepare(options.onProgress)
    const worker = this.ensureWorker()
    const requestId = ++this.nextId
    const instruction = options.instruction ?? 'Rewrite this spoken script for clarity and natural delivery. Preserve its meaning, keep director cues, and return only the revised script.'
    const prompt = `<|im_start|>system\n${instruction}<|im_end|>\n<|im_start|>user\n${source}<|im_end|>\n<|im_start|>assistant\n`
    return new Promise<string>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? 45_000
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId)
        worker.postMessage({ type: 'cancel' })
        reject(new Error('The local draft timed out. Your original script is unchanged.'))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer })
      worker.postMessage({ type: 'generate', requestId, prompt, maxNewTokens: options.maxNewTokens ?? 220 })
    })
  }

  cancel(): void {
    this.prepareToken++
    this.worker?.postMessage({ type: 'cancel' })
    for (const [id, request] of this.pending) { window.clearTimeout(request.timer); request.reject(new Error('Draft cancelled.')); this.pending.delete(id) }
    this.worker?.terminate()
    this.worker = null
    this.ready = false
    this.prepareError = null
  }
  dispose(): void { this.cancel() }
}
