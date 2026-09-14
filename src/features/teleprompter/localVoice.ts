export type VoiceStatus = 'idle' | 'preparing' | 'ready' | 'listening' | 'paused' | 'error'

export interface VoiceCallbacks {
  onStatus?: (status: VoiceStatus, detail?: string) => void
  onTranscript?: (text: string, isFinal: boolean) => void
  onLevel?: (level: number) => void
}

function downsample(input: Float32Array, fromRate: number, toRate = 16_000): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)))
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < Math.max(start + 1, end); j++) sum += input[Math.min(input.length - 1, j)]
    output[i] = sum / Math.max(1, end - start)
  }
  return output
}

function workletUrl(): string {
  const code = `class PromptCapture extends AudioWorkletProcessor {
    constructor(){super();this.buffer=[];this.level=0}
    process(inputs){const input=inputs[0]&&inputs[0][0];if(!input)return true;let sum=0;for(const n of input){sum+=n*n;this.buffer.push(n)}this.level=Math.sqrt(sum/Math.max(1,input.length));if(this.buffer.length>=2048){const b=new Float32Array(this.buffer.splice(0,2048));this.port.postMessage({type:'frame',buffer:b},[b.buffer])}this.port.postMessage({type:'level',level:this.level});return true}
  } registerProcessor('prompt-capture',PromptCapture)`
  return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
}

export class LocalVoiceController {
  private vadWorker: Worker | null = null
  private txWorker: Worker | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private analyser: AnalyserNode | null = null
  private callbacks: VoiceCallbacks = {}
  private status: VoiceStatus = 'idle'
  /** Audio-session generation; worker lifetime is tracked separately. */
  private sessionEpoch = 0
  private workerGeneration = 0
  private prepared = false
  private readyWorkers = 0
  private preparePromise: Promise<void> | null = null
  private objectUrl: string | null = null

  getStatus(): VoiceStatus { return this.status }

  private setStatus(status: VoiceStatus, detail?: string): void {
    this.status = status
    this.callbacks.onStatus?.(status, detail)
  }

  private ensureWorkers(): void {
    if (this.vadWorker && this.txWorker) return
    this.vadWorker = new Worker(new URL('../../workers/prompt-vad.worker.ts', import.meta.url), { type: 'module' })
    this.txWorker = new Worker(new URL('../../workers/prompt-transcribe.worker.ts', import.meta.url), { type: 'module' })
    const generation = this.workerGeneration
    this.vadWorker.onmessage = (event: MessageEvent<{ type: string; buffer?: Float32Array; isFinal?: boolean; audioMs?: number; message?: string }>) => {
      if (generation !== this.workerGeneration) return
      const data = event.data
      if (data.type === 'segment' && data.buffer && this.txWorker) this.txWorker.postMessage({ type: 'segment', buffer: data.buffer, isFinal: data.isFinal ?? true, epoch: (event.data as { epoch?: number }).epoch ?? this.sessionEpoch }, [data.buffer.buffer])
      else if (data.type === 'ready') this.workerReady()
      else if (data.type === 'error') this.setStatus('error', data.message)
    }
    this.txWorker.onmessage = (event: MessageEvent<{ type: string; text?: string; isFinal?: boolean; message?: string; progress?: unknown }>) => {
      if (generation !== this.workerGeneration) return
      const data = event.data
      const messageEpoch = (data as { epoch?: number }).epoch
      if (messageEpoch !== undefined && messageEpoch !== this.sessionEpoch) return
      if (data.type === 'transcript' && data.text) this.callbacks.onTranscript?.(data.text, data.isFinal ?? true)
      else if (data.type === 'ready') this.workerReady()
      else if (data.type === 'error') this.setStatus('error', data.message)
      else if (data.type === 'warning') this.callbacks.onStatus?.('listening', data.message)
    }
  }

  private workerReady(): void {
    this.readyWorkers++
    if (this.readyWorkers >= 2) { this.prepared = true; this.setStatus('ready') }
  }

  /** Downloads and warms local workers. This never asks for microphone access. */
  prepare(callbacks: VoiceCallbacks = {}): Promise<void> {
    this.callbacks = callbacks
    if (this.prepared) { this.setStatus('ready'); return Promise.resolve() }
    if (this.preparePromise) return this.preparePromise
    this.setStatus('preparing', 'Downloading and warming local voice-follow model…')
    this.ensureWorkers()
    this.readyWorkers = 0
    const base = new URL(import.meta.env.BASE_URL, location.origin).href
    this.vadWorker!.postMessage({ type: 'prepare', base })
    this.txWorker!.postMessage({ type: 'prepare', base })
    this.preparePromise = new Promise<void>((resolve, reject) => {
      const untilReady = () => {
        if (this.status === 'error') { this.preparePromise = null; reject(new Error('Local voice model could not be prepared.')); return }
        if (this.prepared) { this.preparePromise = null; resolve(); return }
        window.setTimeout(untilReady, 40)
      }
      untilReady()
    })
    return this.preparePromise
  }

  /** Starts listening from the recorder's already-open microphone track. */
  async start(stream: MediaStream, callbacks: VoiceCallbacks = {}): Promise<void> {
    this.callbacks = callbacks
    if (!stream.getAudioTracks().length) throw new Error('Voice-follow needs an active microphone track.')
    if (!this.prepared) await this.prepare(callbacks)
    await this.stopAudioGraph()
    this.sessionEpoch++
    this.vadWorker?.postMessage({ type: 'reset', epoch: this.sessionEpoch })
    this.txWorker?.postMessage({ type: 'reset', epoch: this.sessionEpoch })
    this.setStatus('listening')
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) throw new Error('AudioWorklet is unavailable in this browser.')
    this.audioContext = new Context({ sampleRate: 16_000 })
    this.source = this.audioContext.createMediaStreamSource(stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    const url = workletUrl()
    this.objectUrl = url
    if (!this.audioContext.audioWorklet) throw new Error('AudioWorklet is unavailable in this browser.')
    await this.audioContext.audioWorklet.addModule(url)
    this.worklet = new AudioWorkletNode(this.audioContext, 'prompt-capture')
    this.worklet.port.onmessage = (event: MessageEvent<{ type: string; buffer?: Float32Array; level?: number }>) => {
      if (event.data.type === 'frame' && event.data.buffer && this.vadWorker) {
        const frame = downsample(event.data.buffer, this.audioContext?.sampleRate ?? 16_000)
        this.vadWorker.postMessage({ type: 'frame', buffer: frame }, [frame.buffer])
      } else if (event.data.type === 'level') this.callbacks.onLevel?.(Math.min(1, (event.data.level ?? 0) * 6))
    }
    this.source.connect(this.analyser)
    this.analyser.connect(this.worklet)
    const silent = this.audioContext.createGain()
    silent.gain.value = 0
    this.worklet.connect(silent)
    silent.connect(this.audioContext.destination)
    await this.audioContext.resume()
  }

  pause(): void { if (this.status === 'listening') { this.audioContext?.suspend(); this.setStatus('paused') } }
  resume(): void { if (this.status === 'paused') { void this.audioContext?.resume(); this.setStatus('listening') } }

  private async stopAudioGraph(): Promise<void> {
    this.worklet?.disconnect()
    this.analyser?.disconnect()
    this.source?.disconnect()
    this.worklet = null
    this.analyser = null
    this.source = null
    if (this.audioContext) { await this.audioContext.close().catch(() => {}); this.audioContext = null }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null }
  }

  async stop(): Promise<void> {
    this.sessionEpoch++
    this.workerGeneration++
    this.vadWorker?.postMessage({ type: 'stop' })
    this.txWorker?.postMessage({ type: 'dispose' })
    await this.stopAudioGraph()
    this.vadWorker?.terminate()
    this.txWorker?.terminate()
    this.vadWorker = null
    this.txWorker = null
    this.prepared = false
    this.readyWorkers = 0
    this.preparePromise = null
    this.setStatus('idle')
  }
}
