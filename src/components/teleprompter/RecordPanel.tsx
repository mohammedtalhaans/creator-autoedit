import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Camera, FlipHorizontal, LockKeyhole, Mic, Pause, Play, RefreshCw, Settings2, ShieldCheck, Square, Type, Video, Volume2, Zap } from 'lucide-react'
import type { CaptureSettings, PromptSettings, RecorderSnapshot, ScriptDocument, TakeRecord } from '../../types/recording'
import { drawCaptureFrame, previewTransform } from '../../features/recording/capture'
import { Alert, Badge, BottomSheet, Button, IconButton, NativeSelect, Slider, Switch } from '../ui/primitives'
import { PromptSettingsPanel } from './PromptSettingsPanel'

export interface RecordPanelProps {
  snapshot: RecorderSnapshot
  settings: CaptureSettings
  script: ScriptDocument
  reader?: ReactNode
  onBack?: () => void
  onSettingsChange: (patch: Partial<CaptureSettings>) => void
  onPromptSettingsChange: (patch: Partial<PromptSettings>) => void
  onOpen: () => void
  onStart: () => Promise<void> | void
  /** Resolves to the durable take so the parent can open TakeReview immediately. */
  onStop: () => Promise<TakeRecord> | void
  onTestMic: () => void
  onRequestStorage: () => void
  onSwitchCamera: () => void
  onRecoveryDownload: () => void
  recoveryAvailable: boolean
  onPromptToggle?: () => void
  promptPlaying?: boolean
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function elapsedLabel(seconds: number): string { const whole = Math.max(0, Math.floor(seconds)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}` }

function formatResolution(requested: CaptureSettings): string {
  const short = requested.resolution
  const long = Math.round(short * 16 / 9)
  return requested.portrait ? `${short}×${long}` : `${long}×${short}`
}

function HardwareControls({ capabilities, settings, onSettingsChange, disabled }: { capabilities: Record<string, unknown>; settings: CaptureSettings; onSettingsChange: (patch: Partial<CaptureSettings>) => void; disabled: boolean }) {
  const videoCapabilities = asRecord(capabilities.video)
  const controls = settings.controls ?? {}
  const exposed = ['zoom', 'exposureCompensation', 'focusDistance', 'torch'].filter((key) => key in videoCapabilities)
  if (exposed.length === 0) return <p className="origin-field-help">This camera exposes no extra controls.</p>
  return <div className="tp-hardware-controls" aria-label="Supported camera controls">
    {exposed.map((key) => {
      const value = videoCapabilities[key]
      if (key === 'torch') return <Switch key={key} label="Flash / torch" checked={Boolean(controls[key])} disabled={disabled} onChange={(enabled) => onSettingsChange({ controls: { ...controls, torch: enabled } })}/>
      if (!value || typeof value !== 'object') return null
      const range = value as { min?: number; max?: number; step?: number }
      if (typeof range.min !== 'number' || typeof range.max !== 'number') return null
      const selected = numeric(controls[key]) ?? range.min
      const step = typeof range.step === 'number' && range.step > 0 ? range.step : Math.max(0.01, (range.max - range.min) / 100)
      const label = key === 'exposureCompensation' ? 'Exposure' : key[0].toUpperCase() + key.slice(1)
      return <Slider key={key} label={label} value={Math.max(range.min, Math.min(range.max, selected))} min={range.min} max={range.max} step={step} display={`${Math.round(selected * 100) / 100}`} disabled={disabled} onChange={(next) => onSettingsChange({ controls: { ...controls, [key]: next } })}/>
    })}
  </div>
}

/** Full-viewport camera surface. PromptReader is a live, independent overlay. */
export function RecordPanel({ snapshot, settings, script, reader, onBack, onSettingsChange, onPromptSettingsChange, onOpen, onStart, onStop, onTestMic, onRequestStorage, onSwitchCamera, onRecoveryDownload, recoveryAvailable, onPromptToggle, promptPlaying = false }: RecordPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actionBusyRef = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptSettingsOpen, setPromptSettingsOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [micTesting, setMicTesting] = useState(false)
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const recordingStartedAtRef = useRef<number | null>(null)
  const [liveElapsed, setLiveElapsed] = useState(0)
  const isRecording = snapshot.status === 'recording'
  const isSaving = snapshot.status === 'saving'
  const isOpening = snapshot.status === 'opening'
  const isFailure = snapshot.status === 'error'
  const unavailable = !snapshot.stream
  const cameraControlsDisabled = isSaving || isRecording || isOpening
  const elapsed = Math.max(snapshot.elapsed, liveElapsed)
  const videoCapabilities = asRecord(snapshot.capabilities.video)
  const hasTorch = videoCapabilities.torch === true
  const torchOn = Boolean(settings.controls?.torch)
  const resolution = useMemo(() => formatResolution(settings), [settings])
  const framingMode = settings.framingMode ?? 'fit'
  const rotation = settings.rotation ?? 'auto'

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = snapshot.stream
    setVideoSize({ width: video.videoWidth || 0, height: video.videoHeight || 0 })
    if (snapshot.stream) void video.play().catch(() => undefined)
    return () => { video.pause(); video.srcObject = null }
  }, [snapshot.stream])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !snapshot.stream) return
    let cancelled = false
    let frameRequest: number | null = null
    let animationRequest: number | null = null
    const frameVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }
    const draw = () => {
      if (cancelled) return
      const sourceWidth = video.videoWidth || videoSize.width
      const sourceHeight = video.videoHeight || videoSize.height
      if (sourceWidth > 0 && sourceHeight > 0) {
        const resolved = previewTransform(settings, snapshot.actualSettings, sourceWidth, sourceHeight)
        const maxPixels = 1280 * 720
        const pixelScale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, resolved.targetWidth * resolved.targetHeight)))
        const targetWidth = Math.max(1, Math.round(resolved.targetWidth * pixelScale))
        const targetHeight = Math.max(1, Math.round(resolved.targetHeight * pixelScale))
        const preview = {
          ...resolved,
          targetWidth,
          targetHeight,
          scale: resolved.scale * pixelScale,
          drawWidth: resolved.drawWidth * pixelScale,
          drawHeight: resolved.drawHeight * pixelScale,
          offsetX: resolved.offsetX * pixelScale,
          offsetY: resolved.offsetY * pixelScale,
          offsets: { x: resolved.offsets.x * pixelScale, y: resolved.offsets.y * pixelScale },
          contentRect: { x: resolved.contentRect.x * pixelScale, y: resolved.contentRect.y * pixelScale, width: resolved.contentRect.width * pixelScale, height: resolved.contentRect.height * pixelScale },
        }
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) { canvas.width = targetWidth; canvas.height = targetHeight }
        const context = canvas.getContext('2d')
        if (context) { context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; drawCaptureFrame(context, video, preview) }
        canvas.dataset.framingMode = preview.framingMode
        canvas.dataset.rotation = String(preview.rotation)
        canvas.dataset.contentRect = JSON.stringify(preview.contentRect)
      }
      if (cancelled) return
      if (typeof frameVideo.requestVideoFrameCallback === 'function') frameRequest = frameVideo.requestVideoFrameCallback(() => draw())
      else animationRequest = window.requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelled = true
      if (frameRequest !== null) frameVideo.cancelVideoFrameCallback?.(frameRequest)
      if (animationRequest !== null) window.cancelAnimationFrame(animationRequest)
    }
  }, [settings, snapshot.actualSettings, snapshot.stream, videoSize.height, videoSize.width])

  useEffect(() => {
    if (!isRecording) { recordingStartedAtRef.current = null; setLiveElapsed(0); return }
    recordingStartedAtRef.current ??= performance.now()
    const interval = window.setInterval(() => {
      if (recordingStartedAtRef.current !== null) setLiveElapsed((performance.now() - recordingStartedAtRef.current) / 1_000)
    }, 100)
    return () => window.clearInterval(interval)
  }, [isRecording])

  const runAction = async (action: () => Promise<unknown> | unknown) => {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    try { await action() } finally { actionBusyRef.current = false; setActionBusy(false) }
  }
  const start = () => void runAction(onStart)
  const stop = () => void runAction(onStop)
  const testMic = () => void runAction(async () => { setMicTesting(true); try { await onTestMic() } finally { setMicTesting(false) } })
  return <section className="tp-record-fullscreen" aria-label="Camera recording" style={{ position: 'fixed', inset: 0, zIndex: 40, minHeight: '100dvh', overflow: 'hidden', background: '#000' }}>
    <div className="tp-record-camera-layer" style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {snapshot.stream ? <><video ref={videoRef} muted playsInline autoPlay onLoadedMetadata={(event) => setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} className="tp-camera-video tp-preview-source" aria-label="Camera preview"/><canvas ref={canvasRef} className={`tp-camera-canvas ${settings.facingMode === 'user' ? 'is-front-mirrored' : ''}`} aria-label="Camera preview image"/></> : <div className="tp-no-camera" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 14, padding: 24, color: '#fff', textAlign: 'center' }}><Camera size={34}/><strong>{isOpening ? 'Opening camera…' : 'Camera preview unavailable'}</strong><span>Allow camera and microphone access to record a take.</span><Button variant="outline" onClick={onOpen} disabled={isOpening}>{isOpening ? 'Opening inputs…' : 'Open camera & mic'}</Button></div>}
    </div>
    <div className="tp-record-surface-scrim" aria-hidden="true"/>

    <header className="tp-record-topbar">
      <IconButton className="tp-record-top-back" label="Back to script" onClick={onBack} disabled={!onBack || isSaving}><ArrowLeft size={20}/></IconButton>
      <div className="tp-record-title-block"><span className="mono">RECORD</span><strong>{script.title || 'Untitled script'}</strong></div>
      <Badge variant="outline" className="tp-step-badge">2 of 4</Badge>
      <Badge variant="outline" className="tp-record-framing-badge"><span>{framingMode === 'fit' ? 'FULL VIEW' : 'FILL SCREEN'}</span><span className="mono">{resolution}</span></Badge>
      {hasTorch && <IconButton label={torchOn ? 'Turn flash off' : 'Turn flash on'} onClick={() => onSettingsChange({ controls: { ...settings.controls, torch: !torchOn } })} disabled={cameraControlsDisabled}><Zap size={18} fill={torchOn ? 'currentColor' : 'none'}/></IconButton>}
    </header>

    {reader && <div className="tp-record-reader-overlay" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>{reader}</div>}
    <div className="tp-record-status" role="status" aria-live="polite"><span className={`tp-record-state-dot ${isRecording ? 'is-recording' : ''} ${isSaving ? 'is-saving' : ''}`} aria-hidden="true"/><span className="mono">{isRecording ? 'REC' : isSaving ? 'SAVING…' : isFailure ? 'RECOVERY' : unavailable ? 'READY TO OPEN' : 'READY'}</span>{isRecording && <span className="mono">{elapsedLabel(elapsed)}</span>}</div>
    {snapshot.error && <div className="tp-record-alert"><Alert title="Recording needs attention" variant="destructive">{snapshot.error}</Alert></div>}

    <footer className="tp-record-bottom-bar">
      <div className="tp-record-bottom-meta">
        <div className="tp-record-mic-meter"><Mic size={16}/><span className="mono" aria-label={`Microphone level ${Math.round(snapshot.level * 100)} percent`}>{Math.round(snapshot.level * 100)}%</span><span aria-hidden="true"><i style={{ width: `${Math.round(snapshot.level * 100)}%` }}/></span></div>
        <span className="mono tp-record-timer">{isRecording ? elapsedLabel(elapsed) : '00:00'}</span>
        <div className="tp-record-utilities">
          {onPromptToggle && <IconButton className="tp-record-utility" label={promptPlaying ? 'Pause prompt' : 'Play prompt'} onClick={onPromptToggle} disabled={isSaving}>{promptPlaying ? <Pause size={18}/> : <Play size={18}/>}</IconButton>}
          <IconButton className="tp-record-utility" label="Open prompt controls" onClick={() => setPromptSettingsOpen(true)}><Type size={18}/></IconButton>
          <IconButton className="tp-record-utility" label="Open capture settings" onClick={() => setSettingsOpen(true)} disabled={cameraControlsDisabled}><Settings2 size={18}/></IconButton>
          <IconButton className="tp-record-utility" label="Switch camera" onClick={onSwitchCamera} disabled={cameraControlsDisabled || unavailable}><FlipHorizontal size={18}/></IconButton>
        </div>
      </div>
      <div className="tp-record-shutter-row"><span aria-hidden="true"/><div className="tp-record-shutter-wrap"><button type="button" className={`tp-record-shutter ${isRecording ? 'is-recording' : ''}`} aria-label={isRecording ? 'Stop and save recording' : 'Start recording'} onClick={isRecording ? stop : start} disabled={unavailable || isSaving || isOpening || actionBusy || isFailure || !script.text.trim()}><span>{isRecording ? <Square size={25} fill="currentColor" strokeWidth={2}/> : null}</span></button><span className="mono">{isSaving ? 'SAVING…' : actionBusy ? 'WAIT…' : isRecording ? 'STOP' : 'REC'}</span></div><span aria-hidden="true"/></div>
      <div className="tp-record-layer-note"><ShieldCheck size={13}/><span>Prompt is separate and never burned into the take.</span></div>
      {recoveryAvailable && <div className="tp-recovery-action"><Button size="small" variant="outline" onClick={onRecoveryDownload}><Video size={14}/> Download recovered take</Button></div>}
    </footer>

    {promptSettingsOpen && <section className="tp-prompt-sheet" role="dialog" aria-modal="false" aria-label="Prompt controls">
      <header className="tp-prompt-sheet-head"><div><span className="eyebrow-small">PROMPT CONTROLS</span><h2>Adjust the reading layer</h2></div><IconButton label="Close prompt controls" onClick={() => setPromptSettingsOpen(false)}><ArrowLeft size={18}/></IconButton></header>
      <PromptSettingsPanel settings={script.settings} compact live onChange={onPromptSettingsChange}/>
      <Button className="tp-prompt-sheet-done" variant="outline" onClick={() => setPromptSettingsOpen(false)}>Done</Button>
    </section>}

    <BottomSheet open={settingsOpen} onOpenChange={setSettingsOpen} title="Capture settings" description="Set the camera before the next take. Changes reopen the preview.">
      <div className="tp-preflight-settings" style={{ display: 'grid', gap: 14 }}>
        <div className="tp-preflight-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <NativeSelect label="Orientation" value={settings.portrait ? 'portrait' : 'landscape'} disabled={cameraControlsDisabled} onChange={(event) => onSettingsChange({ portrait: event.target.value === 'portrait' })}><option value="portrait">Portrait · 9:16</option><option value="landscape">Landscape · 16:9</option></NativeSelect>
          <NativeSelect label="Full view" value={framingMode} disabled={cameraControlsDisabled} onChange={(event) => onSettingsChange({ framingMode: event.target.value as CaptureSettings['framingMode'] })}><option value="fit">Full view</option><option value="fill">Fill screen</option></NativeSelect>
          <NativeSelect label="Rotation" value={rotation} disabled={cameraControlsDisabled} onChange={(event) => { const value = event.target.value; onSettingsChange({ rotation: value === 'auto' ? 'auto' : Number(value) as CaptureSettings['rotation'] }) }}><option value="auto">Auto rotation</option><option value="0">0°</option><option value="90">90°</option><option value="270">270°</option></NativeSelect>
          <NativeSelect label="Resolution" value={String(settings.resolution)} disabled={cameraControlsDisabled} onChange={(event) => onSettingsChange({ resolution: Number(event.target.value) as CaptureSettings['resolution'] })}><option value="720">720p</option><option value="1080">1080p</option><option value="2160">2160p</option></NativeSelect>
          <NativeSelect label="Frame rate" value={String(settings.fps)} disabled={cameraControlsDisabled} onChange={(event) => onSettingsChange({ fps: Number(event.target.value) as CaptureSettings['fps'] })}><option value="24">24 fps</option><option value="25">25 fps</option><option value="30">30 fps</option><option value="50">50 fps</option><option value="60">60 fps</option></NativeSelect>
          <NativeSelect label="Camera" value={settings.cameraId} disabled={cameraControlsDisabled} onChange={(event) => onSettingsChange({ cameraId: event.target.value })}><option value="">Default camera</option>{snapshot.devices.filter((device) => device.kind === 'videoinput').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}</NativeSelect>
          <NativeSelect label="Microphone" value={settings.microphoneId} disabled={cameraControlsDisabled} onChange={(event) => onSettingsChange({ microphoneId: event.target.value })}><option value="">Default microphone</option>{snapshot.devices.filter((device) => device.kind === 'audioinput').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</NativeSelect>
        </div>
        <Switch label="Monitor audio" description="Send a quiet feed to headphones." checked={settings.monitorAudio} disabled={cameraControlsDisabled} onChange={(monitorAudio) => onSettingsChange({ monitorAudio })}/>
        <div className="tp-preflight-mic"><Button variant="outline" size="small" onClick={testMic} disabled={unavailable || cameraControlsDisabled || actionBusy}>{micTesting ? 'Listening…' : 'Test microphone'}</Button><span aria-hidden="true"><i style={{ width: `${Math.round(snapshot.level * 100)}%` }}/></span><Volume2 size={15}/></div>
        <details className="tp-preflight-advanced"><summary><RefreshCw size={14}/> Supported camera controls</summary><HardwareControls capabilities={snapshot.capabilities} settings={settings} onSettingsChange={onSettingsChange} disabled={cameraControlsDisabled}/></details>
        <Button variant="ghost" onClick={onRequestStorage} disabled={isSaving}><LockKeyhole size={15}/> Request persistent storage</Button>
      </div>
    </BottomSheet>
  </section>
}
