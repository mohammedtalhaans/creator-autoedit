import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Film, GitCompareArrows, Heart, RotateCcw, Scissors, Trash2 } from 'lucide-react';
import type { TakeRecord } from '../../types/recording';
import { formatDuration } from '../../features/teleprompter/text';
import { Badge, Button, Card, IconButton } from '../ui/primitives';

export interface TakesPanelProps {
  takes: TakeRecord[];
  loading: boolean;
  onStar: (take: TakeRecord) => void;
  onDelete: (take: TakeRecord) => void;
  onDownload: (take: TakeRecord) => void;
  onEdit: (take: TakeRecord) => void;
  onRetake: (take: TakeRecord) => void;
  /** Optional lazy media loader for real history thumbnails. */
  loadBlob?: (take: TakeRecord) => Promise<Blob>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function isPortrait(take: TakeRecord): boolean {
  const video = asRecord(take.actualSettings.video);
  if (video.displayOrientation === 'portrait' || video.orientation === 'portrait') return true;
  if (video.displayOrientation === 'landscape' || video.orientation === 'landscape') return false;
  const width = Number(video.displayWidth ?? video.width);
  const height = Number(video.displayHeight ?? video.height);
  return Number.isFinite(width) && Number.isFinite(height) ? height > width : Boolean(take.settings.portrait);
}

function statusLabel(take: TakeRecord): string {
  if (take.status === 'complete' && take.playable !== false) return 'Playable';
  return take.status === 'error' ? 'Needs attention' : take.status;
}

function TakeThumbnail({ take, loadBlob }: { take: TakeRecord; loadBlob?: (take: TakeRecord) => Promise<Blob> }) {
  const [url, setUrl] = useState<string | null>(null);
  const portrait = isPortrait(take);
  useEffect(() => {
    let cancelled = false;
    if (!loadBlob || !take.bytes) return undefined;
    void loadBlob(take).then((blob) => {
      if (cancelled || !blob.size || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
      setUrl(URL.createObjectURL(blob));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [loadBlob, take]);

  return <div className={`tp-take-thumb ${portrait ? 'is-portrait' : 'is-landscape'}`} style={{ position: 'relative', width: '100%', maxWidth: portrait ? 144 : 224, aspectRatio: portrait ? '9 / 16' : '16 / 9', overflow: 'hidden', borderRadius: 8, background: '#090909', flex: '0 0 auto' }}>
    {url ? <video src={url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} aria-label={`Preview of ${take.title || 'recorded take'}`}/> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#fff', opacity: .78 }}><Film size={24}/></div>}
    <span className="tp-take-thumb-badge" style={{ position: 'absolute', left: 7, bottom: 7, background: 'rgba(0,0,0,.72)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, padding: '3px 6px', fontSize: 10 }}>{portrait ? '9:16' : '16:9'}</span>
  </div>;
}

export function TakesPanel({ takes, loading, onStar, onDelete, onDownload, onEdit, onRetake, loadBlob }: TakesPanelProps) {
  const [compare, setCompare] = useState<string[]>([]);
  const compareTakes = useMemo(() => compare.map((id) => takes.find((take) => take.id === id)).filter((take): take is TakeRecord => Boolean(take)), [compare, takes]);
  const toggleCompare = (id: string) => setCompare((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 2 ? [current[1], id] : [...current, id]);

  return <section className="tp-takes-panel" aria-label="Take history">
    <div className="tp-takes-head"><div><span className="eyebrow-small">TAKE LIBRARY</span><h2>Your recorded performances</h2><p>Previous takes stay available here. Review the format, favourite one, compare two, or send one into AutoEdit.</p></div><span className="tp-script-count mono">{takes.length} {takes.length === 1 ? 'take' : 'takes'}</span></div>
    {compareTakes.length === 2 && <div className="tp-compare-strip"><div><GitCompareArrows size={16}/><span><strong>Compare A / B</strong><small>{formatDuration(compareTakes[0].duration)} vs {formatDuration(compareTakes[1].duration)} · {compareTakes[0].mimeType}</small></span></div><Button size="small" variant="ghost" onClick={() => setCompare([])}>Clear comparison</Button></div>}
    {loading ? <div className="tp-takes-empty"><span className="tp-loader"/><p>Loading takes…</p></div> : takes.length === 0 ? <div className="tp-takes-empty"><Film size={27}/><strong>No takes yet.</strong><p>Your first recorded performance will appear here with its script cursor, orientation, and capture settings.</p></div> : <div className="tp-take-list">{takes.map((take, index) => <Card className={`tp-take-card ${take.starred ? 'is-starred' : ''} ${compare.includes(take.id) ? 'is-compared' : ''}`} key={take.id} style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: 170 }}><TakeThumbnail take={take} loadBlob={loadBlob}/><div className="tp-take-index mono" style={{ paddingTop: 2 }}>{String(takes.length - index).padStart(2, '0')}</div><div className="tp-take-main"><div className="tp-take-title"><h3>{take.title || `Take ${takes.length - index}`}</h3>{take.starred && <Heart size={14} fill="currentColor"/>}<Badge variant={take.status === 'complete' && take.playable !== false ? 'outline' : 'destructive'}>{statusLabel(take)}</Badge></div><div className="tp-take-meta"><span className="mono">{new Date(take.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><span>{formatDuration(take.duration)}</span><span>{Math.round(take.bytes / 1024)} KB</span><span>{take.mimeType.replace('video/', '')}</span><span>{isPortrait(take) ? 'Portrait' : 'Landscape'}</span><span>from word {take.startWord + 1}</span></div>{take.error && <p className="tp-take-error">{take.error}</p>}<div className="tp-take-actions"><Button size="small" variant="primary" disabled={take.status !== 'complete' || take.playable === false} onClick={() => onEdit(take)}><Scissors size={14}/> AutoEdit this take</Button><Button size="small" variant="secondary" disabled={!take.bytes || take.status === 'recording'} onClick={() => onDownload(take)}><Download size={14}/> {take.status === 'complete' ? 'Download original' : 'Download recovered bytes'}</Button><Button size="small" variant="ghost" onClick={() => onRetake(take)}><RotateCcw size={14}/> Retake this section</Button><IconButton label={take.starred ? 'Remove favourite' : 'Favourite take'} onClick={() => onStar(take)}><Heart size={15} fill={take.starred ? 'currentColor' : 'none'}/></IconButton><IconButton label={compare.includes(take.id) ? 'Remove from compare' : 'Compare this take'} onClick={() => toggleCompare(take.id)}><GitCompareArrows size={15}/></IconButton><IconButton label="Delete take" onClick={() => onDelete(take)}><Trash2 size={15}/></IconButton></div></div></Card>)}</div>}
    <p className="tp-takes-foot"><Check size={15}/> All media stays in this browser’s local recording library. AutoEdit creates a new project and leaves this original available.</p>
  </section>;
}
