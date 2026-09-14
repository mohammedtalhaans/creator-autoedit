import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Camera,
  FlipHorizontal,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Square,
  Video,
  Volume2,
  Zap,
} from 'lucide-react';
import type { CaptureSettings, RecorderSnapshot, ScriptDocument, TakeRecord } from '../../types/recording';
import { Alert, Badge, BottomSheet, Button, IconButton, NativeSelect, Slider, Switch } from '../ui/primitives';

export interface RecordPanelProps {
  snapshot: RecorderSnapshot;
  settings: CaptureSettings;
  script: ScriptDocument;
  reader?: ReactNode;
  onBack?: () => void;
  onSettingsChange: (patch: Partial<CaptureSettings>) => void;
  onOpen: () => void;
  onStart: () => Promise<void> | void;
  /** Resolves to the durable take so the parent can open TakeReview immediately. */
  onStop: () => Promise<TakeRecord> | void;
  onTestMic: () => void;
  onRequestStorage: () => void;
  onSwitchCamera: () => void;
  onRecoveryDownload: () => void;
  recoveryAvailable: boolean;
  onPromptToggle?: () => void;
  promptPlaying?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatResolution(actualSettings: Record<string, unknown>, requested: CaptureSettings): string {
  const video = asRecord(actualSettings.video);
  const width = numeric(video.displayWidth) ?? numeric(video.width);
  const height = numeric(video.displayHeight) ?? numeric(video.height);
  if (width && height) return `${Math.round(width)}×${Math.round(height)}`;
  const short = requested.resolution;
  const long = Math.round(short * 16 / 9);
  return requested.portrait ? `${short}×${long}` : `${long}×${short}`;
}

function actualOrientation(actualSettings: Record<string, unknown>, requested: CaptureSettings): 'portrait' | 'landscape' {
  const video = asRecord(actualSettings.video);
  if (video.displayOrientation === 'portrait' || video.orientation === 'portrait') return 'portrait';
  if (video.displayOrientation === 'landscape' || video.orientation === 'landscape') return 'landscape';
  const width = numeric(video.displayWidth) ?? numeric(video.width);
  const height = numeric(video.displayHeight) ?? numeric(video.height);
  if (width && height && width !== height) return width > height ? 'landscape' : 'portrait';
  return requested.portrait ? 'portrait' : 'landscape';
}

function elapsedLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function HardwareControls({ capabilities, settings, onSettingsChange, disabled }: {
  capabilities: Record<string, unknown>;
  settings: CaptureSettings;
  onSettingsChange: (patch: Partial<CaptureSettings>) => void;
  disabled: boolean;
}) {
  const videoCapabilities = asRecord(capabilities.video);
  const controls = settings.controls ?? {};
  const exposed = ['zoom', 'exposureCompensation', 'focusDistance', 'torch'].filter((key) => key in videoCapabilities);
  if (exposed.length === 0) return <p className="origin-field-help">This camera exposes no extra controls.</p>;
  return <div className="tp-hardware-controls" aria-label="Supported camera controls">
    {exposed.map((key) => {
      const value = videoCapabilities[key];
      if (key === 'torch') return <Switch key={key} label="Flash / torch" checked={Boolean(controls[key])} disabled={disabled} onChange={(enabled) => onSettingsChange({ controls: { ...controls, torch: enabled } })}/>;
      if (!value || typeof value !== 'object') return null;
      const range = value as { min?: number; max?: number; step?: number };
      if (typeof range.min !== 'number' || typeof range.max !== 'number') return null;
      const selected = numeric(controls[key]) ?? range.min;
      const step = typeof range.step === 'number' && range.step > 0 ? range.step : Math.max(0.01, (range.max - range.min) / 100);
      const label = key === 'exposureCompensation' ? 'Exposure' : key[0].toUpperCase() + key.slice(1);
      return <Slider key={key} label={label} value={Math.max(range.min, Math.min(range.max, selected))} min={range.min} max={range.max} step={step} display={`${Math.round(selected * 100) / 100}`} disabled={disabled} onChange={(next) => onSettingsChange({ controls: { ...controls, [key]: next } })}/>;
    })}
  </div>;
}

/** Full-viewport camera surface. PromptReader is deliberately an overlay slot. */
export function RecordPanel({
  snapshot,
  settings,
  script,
  reader,
  onBack,
  onSettingsChange,
  onOpen,
  onStart,
  onStop,
  onTestMic,
  onRequestStorage,
  onSwitchCamera,
  onRecoveryDownload,
  recoveryAvailable,
  onPromptToggle,
  promptPlaying = false,
}: RecordPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const actionBusyRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [micTesting, setMicTesting] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = snapshot.stream;
    if (snapshot.stream) void video.play().catch(() => undefined);
    return () => { video.pause(); video.srcObject = null; };
  }, [snapshot.stream]);

  const isRecording = snapshot.status === 'recording';
  const isSaving = snapshot.status === 'saving';
  const isOpening = snapshot.status === 'opening';
  const isFailure = snapshot.status === 'error';
  const unavailable = !snapshot.stream;
  const controlsDisabled = isSaving || isRecording || isOpening;
  const videoCapabilities = asRecord(snapshot.capabilities.video);
  const hasTorch = videoCapabilities.torch === true;
  const torchOn = Boolean(settings.controls?.torch);
  const resolution = useMemo(() => formatResolution(snapshot.actualSettings, settings), [snapshot.actualSettings, settings]);
  const orientation = actualOrientation(snapshot.actualSettings, settings);

  const runAction = async (action: () => Promise<unknown> | unknown) => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    try { await action(); } finally {
      actionBusyRef.current = false;
      setActionBusy(false);
    }
  };

  const start = () => void runAction(onStart);
  const stop = () => void runAction(onStop);
  const testMic = () => void runAction(async () => {
    setMicTesting(true);
    try { await onTestMic(); } finally { setMicTesting(false); }
  });

  return <section className="tp-record-fullscreen" aria-label="Camera recording" style={{ position: 'fixed', inset: 0, zIndex: 40, minHeight: '100dvh', overflow: 'hidden', background: '#000' }}>
    <div className="tp-record-camera-layer" style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {snapshot.stream ? <video ref={videoRef} muted playsInline autoPlay className={`tp-camera-video ${script.settings.mirror ? 'is-mirrored' : ''}`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: 'center', transform: script.settings.mirror ? 'scaleX(-1)' : undefined }} aria-label="Camera preview"/> : <div className="tp-no-camera" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 14, padding: 24, color: '#fff', textAlign: 'center' }}><Camera size={34}/><strong>{isOpening ? 'Opening camera…' : 'Camera preview unavailable'}</strong><span>Allow camera and microphone access to record a take.</span><Button variant="outline" onClick={onOpen} disabled={isOpening}>{isOpening ? 'Opening inputs…' : 'Open camera & mic'}</Button></div>}
    </div>

    <div className="tp-record-surface-scrim" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.8), transparent 24%, transparent 64%, rgba(0,0,0,.9))' }}/>

    <header className="tp-record-topbar" style={{ position: 'absolute', top: 'max(52px, calc(env(safe-area-inset-top) + 42px))', left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', color: '#fff' }}>
      <IconButton className="tp-record-top-back" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,.5)', color: '#fff', border: '1px solid rgba(255,255,255,.38)' }} label="Back to script" onClick={onBack} disabled={!onBack || isSaving}><ArrowLeft size={20}/></IconButton>
      <div style={{ minWidth: 0, flex: 1 }}><span className="mono" style={{ display: 'block', fontSize: 10, opacity: .72, letterSpacing: '.08em' }}>RECORD</span><strong style={{ display: 'block', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{script.title || 'Untitled script'}</strong></div>
      <Badge variant="outline" className="tp-record-resolution"><span className="mono">{resolution}</span><span style={{ marginLeft: 6 }}>{orientation === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE'}</span></Badge>
      {hasTorch && <IconButton label={torchOn ? 'Turn flash off' : 'Turn flash on'} onClick={() => onSettingsChange({ controls: { ...settings.controls, torch: !torchOn } })} disabled={controlsDisabled}><Zap size={18} fill={torchOn ? 'currentColor' : 'none'}/></IconButton>}
    </header>

    {reader && <div className="tp-record-reader-overlay" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>{reader}</div>}
    {reader && <style>{`.tp-record-reader-overlay .tp-reader-head,.tp-record-reader-overlay .tp-reader-controls{display:none!important}.tp-record-reader-overlay .tp-reader-wrap{pointer-events:none!important}.tp-record-reader-overlay .tp-reading-stage{pointer-events:none!important}`}</style>}

    <div className="tp-record-status" role="status" aria-live="polite" style={{ position: 'absolute', top: 'max(112px, calc(env(safe-area-inset-top) + 100px))', left: 16, zIndex: 4, display: 'flex', alignItems: 'center', gap: 8, color: '#fff', pointerEvents: 'none' }}>
      <span className={`tp-record-state-dot ${isRecording ? 'is-recording' : ''} ${isSaving ? 'is-saving' : ''}`} aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: isRecording ? '#ff3b30' : '#fff', opacity: isSaving ? .7 : 1 }}/>
      <span className="mono" style={{ fontSize: 10, letterSpacing: '.08em' }}>{isRecording ? 'REC' : isSaving ? 'SAVING…' : isFailure ? 'RECOVERY' : unavailable ? 'READY TO OPEN' : 'READY'}</span>
      {isRecording && <span className="mono" style={{ fontSize: 12 }}>{elapsedLabel(snapshot.elapsed)}</span>}
    </div>

    {snapshot.error && <div className="tp-record-alert" style={{ position: 'absolute', top: 'max(148px, calc(env(safe-area-inset-top) + 136px))', left: 16, right: 16, zIndex: 5 }}><Alert title="Recording needs attention" variant="destructive">{snapshot.error}</Alert></div>}

    <footer className="tp-record-bottom-bar" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 18px max(20px, env(safe-area-inset-bottom))', color: '#fff' }}>
      <div className="tp-record-bottom-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 92 }}><Mic size={16}/><span className="mono" aria-label={`Microphone level ${Math.round(snapshot.level * 100)} percent`} style={{ fontSize: 11 }}>{Math.round(snapshot.level * 100)}%</span><span aria-hidden="true" style={{ width: 70, height: 4, background: 'rgba(255,255,255,.25)', borderRadius: 99, overflow: 'hidden' }}><i style={{ display: 'block', width: `${Math.round(snapshot.level * 100)}%`, height: '100%', background: '#fff', borderRadius: 99 }}/></span></div>
        <span className="mono" style={{ fontSize: 12, opacity: .86 }}>{isRecording ? elapsedLabel(snapshot.elapsed) : '00:00'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 92, justifyContent: 'flex-end' }}>
          {onPromptToggle && <IconButton className="tp-record-utility" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,.48)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }} label={promptPlaying ? 'Pause prompt' : 'Play prompt'} onClick={onPromptToggle} disabled={isSaving}>{promptPlaying ? <Pause size={18}/> : <Play size={18}/>}</IconButton>}
          <IconButton className="tp-record-utility" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,.48)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }} label="Open capture settings" onClick={() => setSettingsOpen(true)} disabled={controlsDisabled}><Settings2 size={18}/></IconButton>
          <IconButton className="tp-record-utility" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,.48)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }} label="Switch camera" onClick={onSwitchCamera} disabled={controlsDisabled || unavailable}><FlipHorizontal size={18}/></IconButton>
        </div>
      </div>

      <div className="tp-record-shutter-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <span aria-hidden="true" style={{ width: 44 }}/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <button type="button" className={`tp-record-shutter ${isRecording ? 'is-recording' : ''}`} aria-label={isRecording ? 'Stop and save recording' : 'Start recording'} onClick={isRecording ? stop : start} disabled={unavailable || isSaving || isOpening || actionBusy || isFailure || !script.text.trim()} style={{ width: 78, height: 78, display: 'grid', placeItems: 'center', padding: 7, border: '3px solid #fff', borderRadius: '50%', background: 'transparent', color: isRecording ? '#ff3b30' : '#fff', cursor: 'pointer', opacity: unavailable || actionBusy ? .55 : 1 }}>
            <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: isRecording ? 11 : '50%', background: isRecording ? '#ff3b30' : '#fff', transition: 'border-radius 120ms ease' }}>{isRecording ? <Square size={25} fill="currentColor" strokeWidth={2} style={{ margin: '26px' }}/> : null}</span>
          </button>
          <span className="mono" style={{ fontSize: 9, opacity: .7, textAlign: 'center' }}>{isSaving ? 'SAVING…' : actionBusy ? 'WAIT…' : isRecording ? 'STOP' : 'REC'}</span>
        </div>
        <span aria-hidden="true" style={{ width: 44 }}/>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 18, fontSize: 10, opacity: .75 }}><ShieldCheck size={13}/><span>Prompt is a separate layer and is never burned into the take.</span></div>
      {recoveryAvailable && <div style={{ display: 'flex', justifyContent: 'center' }}><Button size="small" variant="outline" onClick={onRecoveryDownload}><Video size={14}/> Download recovered take</Button></div>}
    </footer>

    <BottomSheet open={settingsOpen} onOpenChange={setSettingsOpen} title="Capture settings" description="Set the camera before the next take. Changes reopen the preview." >
      <div className="tp-preflight-settings" style={{ display: 'grid', gap: 14 }}>
        <div className="tp-preflight-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <NativeSelect label="Orientation" value={settings.portrait ? 'portrait' : 'landscape'} disabled={controlsDisabled} onChange={(event) => onSettingsChange({ portrait: event.target.value === 'portrait' })}><option value="portrait">Portrait · 9:16</option><option value="landscape">Landscape · 16:9</option></NativeSelect>
          <NativeSelect label="Resolution" value={String(settings.resolution)} disabled={controlsDisabled} onChange={(event) => onSettingsChange({ resolution: Number(event.target.value) as CaptureSettings['resolution'] })}><option value="720">720p</option><option value="1080">1080p</option><option value="2160">2160p</option></NativeSelect>
          <NativeSelect label="Frame rate" value={String(settings.fps)} disabled={controlsDisabled} onChange={(event) => onSettingsChange({ fps: Number(event.target.value) as CaptureSettings['fps'] })}><option value="24">24 fps</option><option value="25">25 fps</option><option value="30">30 fps</option><option value="50">50 fps</option><option value="60">60 fps</option></NativeSelect>
          <NativeSelect label="Camera" value={settings.cameraId} disabled={controlsDisabled} onChange={(event) => onSettingsChange({ cameraId: event.target.value })}><option value="">Default camera</option>{snapshot.devices.filter((device) => device.kind === 'videoinput').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}</NativeSelect>
          <NativeSelect label="Microphone" value={settings.microphoneId} disabled={controlsDisabled} onChange={(event) => onSettingsChange({ microphoneId: event.target.value })}><option value="">Default microphone</option>{snapshot.devices.filter((device) => device.kind === 'audioinput').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</NativeSelect>
        </div>
        <Switch label="Monitor audio" description="Send a quiet feed to headphones." checked={settings.monitorAudio} disabled={controlsDisabled} onChange={(monitorAudio) => onSettingsChange({ monitorAudio })}/>
        <div className="tp-preflight-mic" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Button variant="outline" size="small" onClick={testMic} disabled={unavailable || controlsDisabled || actionBusy}>{micTesting ? 'Listening…' : 'Test microphone'}</Button><span aria-hidden="true" style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}><i style={{ display: 'block', width: `${Math.round(snapshot.level * 100)}%`, height: '100%', background: '#fff', borderRadius: 99 }}/></span><Volume2 size={15}/></div>
        <details className="tp-preflight-advanced"><summary><RefreshCw size={14}/> Supported camera controls</summary><HardwareControls capabilities={snapshot.capabilities} settings={settings} onSettingsChange={onSettingsChange} disabled={controlsDisabled}/></details>
        <Button variant="ghost" onClick={onRequestStorage} disabled={isSaving}><LockKeyhole size={15}/> Request persistent storage</Button>
      </div>
    </BottomSheet>
  </section>;
}
