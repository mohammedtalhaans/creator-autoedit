import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Camera, Circle, Headphones, LockKeyhole, Mic, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Square, Video, Volume2 } from 'lucide-react'
import type { CaptureSettings, RecorderSnapshot, ScriptDocument } from '../../types/recording'
import { createPortraitProcessor, type PortraitProcessor } from '../../features/portrait-effects'
import { Button, IconButton, Slider, Switch } from '../ui/primitives'

interface RecordPanelProps {
  snapshot: RecorderSnapshot
  settings: CaptureSettings
  script: ScriptDocument
  onSettingsChange: (patch: Partial<CaptureSettings>) => void
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onTestMic: () => void
  onRequestStorage: () => void
  onSwitchCamera: () => void
  onRecoveryDownload: () => void
  recoveryAvailable: boolean
  reader?: ReactNode
}

function titleCase(value: string): string { return value === 'original' ? 'Original' : value.slice(0, 1).toUpperCase() + value.slice(1) }

function HardwareControls({ capabilities, actualSettings, settings, onSettingsChange }: { capabilities: Record<string, unknown>; actualSettings: Record<string, unknown>; settings: CaptureSettings; onSettingsChange: (patch: Partial<CaptureSettings>) => void }) {
  const controls = settings.controls ?? {}
  const videoCapabilities = capabilities.video as Record<string, unknown> | undefined
  const actualVideo = actualSettings.video as Record<string, unknown> | undefined
  if (!videoCapabilities) return <p>Camera hardware controls are not exposed by this browser.</p>
  const setControl = (key: string, value: string | number | boolean) => onSettingsChange({ controls: { ...controls, [key]: value } })
  const numeric = (key: string, label: string) => {
    const range = videoCapabilities[key] as { min?: number; max?: number; step?: number } | undefined
    if (!range || typeof range !== 'object' || typeof range.min !== 'number' || typeof range.max !== 'number') return null
    const actual = actualVideo?.[key]
    const selected = controls[key]
    const value = typeof selected === 'number' ? selected : typeof actual === 'number' ? actual : range.min
    const step = typeof range.step === 'number' && range.step > 0 ? range.step : Math.max(.01, (range.max - range.min) / 100)
    return <Slider key={key} label={label} value={Math.max(range.min, Math.min(range.max, value))} min={range.min} max={range.max} step={step} display={`${Math.round(value * 100) / 100}`} onChange={(next) => setControl(key, next)}/>
  }
  const enumControl = (key: string, label: string) => {
    const values = Array.isArray(videoCapabilities[key]) ? videoCapabilities[key].map(String) : []
    if (!values.length) return null
    const actual = actualVideo?.[key]
    return <label key={key}><span>{label}</span><select value={String(controls[key] ?? actual ?? values[0])} onChange={(event) => setControl(key, event.target.value)}>{values.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
  }
  const boolControl = (key: string, label: string) => videoCapabilities[key] === true ? <label key={key} className="tp-hardware-check"><input type="checkbox" checked={Boolean(controls[key] ?? actualVideo?.[key])} onChange={(event) => setControl(key, event.target.checked)}/><span>{label}</span></label> : null
  const supportedNumeric = [['zoom', 'Camera zoom'], ['exposureCompensation', 'Exposure compensation'], ['exposureTime', 'Exposure time'], ['iso', 'ISO'], ['colorTemperature', 'Colour temperature'], ['focusDistance', 'Focus distance']].map(([key, label]) => numeric(key, label)).filter((control): control is ReactElement => Boolean(control))
  const supportedEnums = [['focusMode', 'Focus mode'], ['exposureMode', 'Exposure mode'], ['whiteBalanceMode', 'White balance'], ['stabilization', 'Stabilization'], ['imageStabilization', 'Image stabilization']].map(([key, label]) => enumControl(key, label)).filter((control): control is ReactElement => Boolean(control))
  const supportedBooleans = [boolControl('torch', 'Torch'), boolControl('stabilization', 'Stabilization')].filter((control): control is ReactElement => Boolean(control))
  const hasControl = supportedNumeric.length > 0 || supportedEnums.length > 0 || supportedBooleans.length > 0
  if (!hasControl) return <p>Camera hardware controls are not exposed by this browser.</p>
  return <div className="tp-hardware-controls">{supportedNumeric}{supportedEnums}{supportedBooleans}</div>
}

export function RecordPanel({ snapshot, settings, script, onSettingsChange, onOpen, onStart, onStop, onTestMic, onRequestStorage, onSwitchCamera, onRecoveryDownload, recoveryAvailable, reader }: RecordPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const portraitRef = useRef<PortraitProcessor | null>(null)
  const frameBusyRef = useRef(false)
  const [portraitPreparing, setPortraitPreparing] = useState(false)
  const [portraitPrepared, setPortraitPrepared] = useState(false)
  const [portraitError, setPortraitError] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = snapshot.stream
    if (snapshot.stream) void video.play().catch(() => {})
    return () => { video.srcObject = null }
  }, [snapshot.stream])

  useEffect(() => () => { portraitRef.current?.dispose(); portraitRef.current = null }, [])

  const isRecording = snapshot.status === 'recording' || snapshot.status === 'saving'
  const opening = snapshot.status === 'opening'
  const effects = useMemo(() => settings.portraitEffects ?? { backgroundBlur: 0, skinSmoothing: 0 }, [settings.portraitEffects])
  const activeEffects = Boolean(effects.backgroundBlur || effects.skinSmoothing)
  const looks = ['original', 'natural', 'soft', 'vivid', 'warm', 'mono', 'cool']
  const intensity = Math.max(0, Math.min(1, settings.lookIntensity))
  const previewFilter = settings.look === 'mono'
    ? `grayscale(${intensity})`
    : settings.look === 'warm'
      ? `sepia(${0.22 * intensity}) saturate(${1 + 0.08 * intensity})`
      : settings.look === 'cool'
        ? `saturate(${1 - 0.12 * intensity}) hue-rotate(${8 * intensity}deg) brightness(${1 + 0.03 * intensity})`
        : settings.look === 'vivid'
          ? `saturate(${1 + 0.28 * intensity}) contrast(${1 + 0.04 * intensity})`
          : settings.look === 'soft'
            ? `saturate(${1 - 0.14 * intensity}) contrast(${1 - 0.06 * intensity}) brightness(${1 + 0.04 * intensity})`
            : settings.look === 'natural'
              ? `saturate(${1 + 0.04 * intensity}) contrast(${1 + 0.01 * intensity})`
              : undefined

  useEffect(() => {
    if (!portraitPrepared || !snapshot.stream || !activeEffects) return
    let cancelled = false
    const tick = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const processor = portraitRef.current
      if (!video || !canvas || !processor || cancelled || video.readyState < 2 || frameBusyRef.current) return
      const width = video.videoWidth || 640
      const height = video.videoHeight || 360
      canvas.width = width
      canvas.height = height
      frameBusyRef.current = true
      try {
        const bitmap = await processor.process(video, width, height, effects, performance.now())
        if (!cancelled) canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()
      } catch (error) {
        if (!cancelled && (error instanceof DOMException ? error.name !== 'AbortError' : true)) setPortraitError(error instanceof Error ? error.message : String(error))
      } finally { frameBusyRef.current = false }
    }
    const timer = window.setInterval(() => void tick(), 120)
    void tick()
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [activeEffects, effects, portraitPrepared, snapshot.stream])

  const preparePortrait = async () => {
    if (portraitPrepared || portraitPreparing) return
    setPortraitError('')
    setPortraitPreparing(true)
    try {
      portraitRef.current ??= createPortraitProcessor()
      await portraitRef.current.prepare()
      setPortraitPrepared(true)
    } catch (error) { setPortraitError(error instanceof Error ? error.message : String(error)) }
    finally { setPortraitPreparing(false) }
  }

  const videoSettings = snapshot.actualSettings.video as Record<string, unknown> | undefined

  return <div className="tp-record-side">
    <div className="tp-record-viewfinder">
      {snapshot.stream ? <><video ref={videoRef} muted playsInline className={`tp-camera-video ${script.settings.mirror ? 'is-mirrored' : ''} ${portraitPrepared && activeEffects ? 'tp-video-under-portrait' : ''}`} style={{ filter: previewFilter }} aria-label="Camera preview"/><canvas ref={canvasRef} className={`tp-portrait-canvas ${portraitPrepared && activeEffects ? 'is-visible' : ''}`} aria-hidden="true"/></> : <div className="tp-no-camera"><Camera size={25}/><strong>Camera preview stays private.</strong><span>Open it when you are ready to record. Read-only prompting never asks for permission.</span><Button variant="secondary" onClick={onOpen} disabled={opening}>{opening ? 'Opening inputs…' : 'Open camera & mic'}</Button></div>}
      {snapshot.stream && <div className="tp-viewfinder-readout"><span className="mono"><i/> LIVE PREVIEW</span><span className="mono">{videoSettings?.width && videoSettings?.height ? `${videoSettings.width}×${videoSettings.height}` : 'Negotiating'}</span></div>}
      {isRecording && <div className="tp-record-pill"><Circle size={10} fill="currentColor"/> REC <span className="mono">{Math.floor(snapshot.elapsed / 60)}:{String(Math.floor(snapshot.elapsed % 60)).padStart(2, '0')}</span></div>}
      {reader && <div className="tp-record-reader-overlay">{reader}</div>}
    </div>
    <div className="tp-record-header"><div><span className="eyebrow-small">RECORDING DESK</span><h2>Keep the script near the lens.</h2></div><span className="tp-record-title mono">{script.title}</span></div>
    <div className="tp-record-actions"><Button variant="primary" className="tp-record-button" onClick={isRecording ? onStop : onStart} disabled={!snapshot.stream || snapshot.status === 'opening' || snapshot.status === 'saving' || !script.text.trim()}>{isRecording ? <><Square size={17} fill="currentColor"/> Stop & save take</> : <><Circle size={17} fill="currentColor"/> {snapshot.activeTake?.status === 'complete' ? 'Record another take' : 'Start recording'}</>}</Button><IconButton label="Reopen camera with current settings" onClick={onSwitchCamera} disabled={!snapshot.stream}><RefreshCw size={17}/></IconButton></div>
    <p className="tp-record-note"><ShieldCheck size={14}/> The script is a separate reading layer. It is never burned into the recorded video.</p>
    {snapshot.error && <div className="tp-record-error" role="status"><strong>Recording needs attention</strong><span>{snapshot.error}</span><Button size="small" variant="secondary" onClick={onStop}>Stop and finish the manifest</Button>{recoveryAvailable && <Button size="small" variant="ghost" onClick={onRecoveryDownload}>Download recovered take</Button>}</div>}
    {snapshot.notice && <p className="tp-record-notice" role="status">{snapshot.notice}</p>}
    <section className="tp-capture-settings"><div className="tp-section-heading"><span className="eyebrow-small">CAPTURE SETTINGS</span><span className="mono">ACTUAL VALUES AFTER OPEN</span></div><div className="tp-control-grid"><label><span><Video size={14}/> Orientation</span><select value={settings.portrait ? 'portrait' : 'landscape'} disabled={isRecording} onChange={(event) => onSettingsChange({ portrait: event.target.value === 'portrait' })}><option value="portrait">Portrait 9:16</option><option value="landscape">Landscape 16:9</option></select></label><label><span><Camera size={14}/> Resolution</span><select value={settings.resolution} disabled={isRecording} onChange={(event) => onSettingsChange({ resolution: Number(event.target.value) as CaptureSettings['resolution'] })}><option value="720">720p</option><option value="1080">1080p</option><option value="2160">2160p · source only</option></select></label><label><span><RefreshCw size={14}/> Frame rate</span><select value={settings.fps} disabled={isRecording} onChange={(event) => onSettingsChange({ fps: Number(event.target.value) as CaptureSettings['fps'] })}><option value="24">24 fps</option><option value="25">25 fps</option><option value="30">30 fps</option><option value="50">50 fps</option><option value="60">60 fps</option></select></label><label><span><Mic size={14}/> Microphone</span><select value={settings.microphoneId} disabled={isRecording} onChange={(event) => onSettingsChange({ microphoneId: event.target.value })}><option value="">Default microphone</option>{snapshot.devices.filter((device) => device.kind === 'audioinput').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label><label><span><Camera size={14}/> Camera</span><select value={settings.cameraId} disabled={isRecording} onChange={(event) => onSettingsChange({ cameraId: event.target.value })}><option value="">Default camera</option>{snapshot.devices.filter((device) => device.kind === 'videoinput').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}</select></label></div><div className="tp-look-row"><label><span>Preview look</span><select value={settings.look} disabled={isRecording} onChange={(event) => onSettingsChange({ look: event.target.value })}>{looks.map((look) => <option key={look} value={look}>{titleCase(look)}</option>)}</select></label><Slider label="Look intensity" value={settings.lookIntensity} min={0} max={1} step={.05} display={`${Math.round(settings.lookIntensity * 100)}%`} disabled={settings.look === 'original' || isRecording} onChange={(lookIntensity) => onSettingsChange({ lookIntensity })}/></div><div className="tp-portrait-effects"><div className="tp-portrait-head"><div><span><Sparkles size={13}/> Portrait preview</span><small>Optional local mask · raw recording stays native</small></div>{!portraitPrepared ? <Button size="small" variant="secondary" disabled={portraitPreparing} onClick={() => void preparePortrait()}>{portraitPreparing ? 'Preparing…' : 'Prepare effects'}</Button> : <span className="mono tp-prepared-tag">READY</span>}</div><div className="tp-portrait-sliders"><Slider label="Background blur" value={effects.backgroundBlur} min={0} max={1} step={.05} display={`${Math.round(effects.backgroundBlur * 100)}%`} disabled={!portraitPrepared || isRecording} onChange={(backgroundBlur) => onSettingsChange({ portraitEffects: { ...effects, backgroundBlur } })}/><Slider label="Skin smoothing" value={effects.skinSmoothing} min={0} max={1} step={.05} display={`${Math.round(effects.skinSmoothing * 100)}%`} disabled={!portraitPrepared || isRecording} onChange={(skinSmoothing) => onSettingsChange({ portraitEffects: { ...effects, skinSmoothing } })}/></div>{portraitError && <p className="tp-portrait-error">{portraitError}</p>}{!portraitPrepared && <p className="tp-portrait-note">Prepare the local model to enable these controls. Only the preview is processed; the saved take remains the original camera stream.</p>}</div><div className="tp-switches"><Switch label="Monitor audio" description="Opt in to a quiet headphone feed." checked={settings.monitorAudio} disabled={isRecording} onChange={(monitorAudio) => onSettingsChange({ monitorAudio })}/><button type="button" className="tp-mic-test" onClick={onTestMic} disabled={!snapshot.stream || isRecording}><Volume2 size={15}/> Test microphone <span className="tp-meter-inline"><i style={{ width: `${Math.round(snapshot.level * 100)}%` }}/></span></button></div><details className="tp-advanced-capture"><summary><SlidersHorizontal size={15}/> Hardware controls <span className="mono">ONLY WHAT YOUR CAMERA EXPOSES</span></summary><HardwareControls capabilities={snapshot.capabilities} actualSettings={snapshot.actualSettings} settings={settings} onSettingsChange={onSettingsChange}/></details></section>
    <div className="tp-capture-foot"><button type="button" onClick={onRequestStorage}><LockKeyhole size={14}/> Request persistent storage</button><span><Headphones size={13}/> Headphone monitoring is opt-in</span></div>
    <p className="tp-limit-note">Editor export supports up to 1080p / 30 fps. Higher resolution and frame-rate originals remain available for download, and you can choose AutoEdit after recording.</p>
  </div>
}
