import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, Heart, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { TakeRecord } from '../../types/recording';
import { Alert, Badge, Button, IconButton } from '../ui/primitives';

export interface TakeReviewProps {
  take: TakeRecord;
  /** Resolve the durable IndexedDB media after the stop transaction completes. */
  loadBlob: () => Promise<Blob>;
  onBack: () => void;
  onRetake: () => void;
  onKeep: () => void;
  onDownload: () => void;
  onFavourite?: (favourite: boolean) => void;
  /** Optional display number supplied by the takes history. */
  takeNumber?: number;
}

type ReviewState = 'loading' | 'ready' | 'error';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function safeLoad(video: HTMLVideoElement): void {
  try { video.load(); } catch { /* Some test media shims do not implement load(). */ }
}

function safePlay(video: HTMLVideoElement): void {
  try { void video.play().catch(() => undefined); } catch { /* Autoplay is optional on iOS and in test shims. */ }
}

/** Immediate, full-screen decision surface for the take just written. */
export function TakeReview({ take, loadBlob, onBack, onRetake, onKeep, onDownload, onFavourite, takeNumber }: TakeReviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loaderRef = useRef(loadBlob);
  const objectUrlRef = useRef<string | null>(null);
  const [state, setState] = useState<ReviewState>('loading');
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(take.duration);
  const [muted, setMuted] = useState(true);

  loaderRef.current = loadBlob;

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    setState('loading');
    setError('');
    setDuration(take.duration);
    if (video) {
      video.pause();
      video.removeAttribute('src');
      safeLoad(video);
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    void loaderRef.current().then((blob) => {
      if (cancelled) return;
      if (!blob || blob.size === 0) throw new Error('This take contains no media bytes.');
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('This browser cannot load local review media.');
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const currentVideo = videoRef.current;
      if (!currentVideo) throw new Error('The review video is unavailable.');
      currentVideo.muted = true;
      currentVideo.src = url;
      safeLoad(currentVideo);
      safePlay(currentVideo);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setState('error');
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });

    return () => {
      cancelled = true;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        safeLoad(video);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [take.id, take.duration]);

  const takeLabel = takeNumber ? `Take ${takeNumber}` : take.title || 'Latest take';
  const mediaRejected = take.status !== 'complete' || take.playable === false;
  const canKeep = state === 'ready' && !mediaRejected;

  return <section className="tp-take-review" aria-label="Review recorded take" style={{ position: 'fixed', inset: 0, zIndex: 45, minHeight: '100dvh', overflow: 'hidden', background: '#000', color: '#fff' }}>
    <div className="tp-take-review-video-layer" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#000' }}>
      <video ref={videoRef} playsInline controls muted={muted} onLoadedMetadata={(event) => { const next = event.currentTarget.duration; if (Number.isFinite(next) && next > 0) setDuration(next); }} onCanPlay={(event) => { setState('ready'); safePlay(event.currentTarget); }} onError={() => { setState('error'); setError('This take could not be decoded on this device. Download it or retake this section.'); }} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: '#000' }} aria-label="Recorded take preview" />
    </div>
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.84), transparent 28%, transparent 62%, rgba(0,0,0,.92))' }}/>

    <header className="tp-take-review-topbar" style={{ position: 'absolute', top: 'max(52px, calc(env(safe-area-inset-top) + 42px))', left: 0, right: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
      <IconButton className="tp-review-top-back" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,.5)', color: '#fff', border: '1px solid rgba(255,255,255,.38)' }} label="Back to recording" onClick={onBack}><ArrowLeft size={20}/></IconButton>
      <div style={{ minWidth: 0, flex: 1 }}><span className="mono" style={{ display: 'block', fontSize: 10, opacity: .72, letterSpacing: '.08em' }}>REVIEW</span><strong style={{ display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}>{take.title || 'Recorded take'}</strong></div>
      <Badge variant={state === 'error' || mediaRejected ? 'destructive' : 'outline'}>{state === 'loading' ? 'LOADING…' : state === 'ready' && !mediaRejected ? 'READY' : 'CHECK TAKE'}</Badge>
      {onFavourite && <IconButton label={take.starred ? 'Remove favourite' : 'Favourite take'} onClick={() => onFavourite(!take.starred)}><Heart size={18} fill={take.starred ? 'currentColor' : 'none'}/></IconButton>}
    </header>

    <div className="tp-take-review-meta" style={{ position: 'absolute', left: 18, right: 18, bottom: 'max(126px, calc(env(safe-area-inset-bottom) + 108px))', zIndex: 2, display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 14 }}>
      <div style={{ minWidth: 0 }}><span className="mono" style={{ display: 'block', fontSize: 11, opacity: .72 }}>{takeLabel}</span><strong style={{ display: 'block', maxWidth: '70vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 18 }}>Your camera take</strong><span className="mono" style={{ display: 'block', marginTop: 5, fontSize: 12, opacity: .82 }}>{formatDuration(duration)} · {Math.round(take.bytes / 1024)} KB</span></div>
      <Button variant="ghost" size="small" onClick={() => { const nextMuted = !muted; setMuted(nextMuted); if (videoRef.current) videoRef.current.muted = nextMuted; }} disabled={state !== 'ready'} aria-label={muted ? 'Unmute preview' : 'Mute preview'}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>} {muted ? 'Sound off' : 'Sound on'}</Button>
    </div>

    {state === 'loading' && <p role="status" className="mono" style={{ position: 'absolute', left: 18, right: 18, bottom: 'max(112px, calc(env(safe-area-inset-bottom) + 94px))', zIndex: 2, margin: 0, fontSize: 11, opacity: .78 }}>Loading your take…</p>}
    {(state === 'error' || mediaRejected) && <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'max(112px, calc(env(safe-area-inset-bottom) + 94px))', zIndex: 3 }}><Alert title="This take needs attention" variant="destructive">{error || take.error || 'Playback validation did not pass. Download the bytes or retake this section.'}</Alert></div>}

    <footer className="tp-take-review-actions" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, padding: '14px 16px max(18px, env(safe-area-inset-bottom))', background: 'linear-gradient(transparent, rgba(0,0,0,.94) 25%)' }}>
      <Button variant="outline" size="large" onClick={onRetake}><RotateCcw size={17}/> Retake</Button>
      <Button variant="primary" size="large" onClick={onKeep} disabled={!canKeep}><Check size={17}/> Keep &amp; continue</Button>
      <Button variant="ghost" size="small" onClick={onDownload} style={{ gridColumn: '1 / -1' }}><Download size={15}/> Download take</Button>
    </footer>
  </section>;
}
