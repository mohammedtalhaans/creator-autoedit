import { useMemo, useState } from 'react'
import { Check, Download, Film, GitCompareArrows, Heart, RotateCcw, Trash2, WandSparkles } from 'lucide-react'
import type { TakeRecord } from '../../types/recording'
import { formatDuration } from '../../features/teleprompter/text'
import { Button, IconButton } from '../ui/primitives'

interface TakesPanelProps {
  takes: TakeRecord[]
  loading: boolean
  onStar: (take: TakeRecord) => void
  onDelete: (take: TakeRecord) => void
  onDownload: (take: TakeRecord) => void
  onEdit: (take: TakeRecord) => void
  onRetake: (take: TakeRecord) => void
}

export function TakesPanel({ takes, loading, onStar, onDelete, onDownload, onEdit, onRetake }: TakesPanelProps) {
  const [compare, setCompare] = useState<string[]>([])
  const compareTakes = useMemo(() => compare.map((id) => takes.find((take) => take.id === id)).filter((take): take is TakeRecord => Boolean(take)), [compare, takes])
  const toggleCompare = (id: string) => setCompare((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 2 ? [current[1], id] : [...current, id])

  return <section className="tp-takes-panel">
    <div className="tp-takes-head"><div><span className="eyebrow-small">TAKE LIBRARY</span><h2>Your raw performances stay here.</h2><p>Previous takes are untouched. Pick a favourite, compare two, or send one into AutoEdit.</p></div><span className="tp-script-count mono">{takes.length} {takes.length === 1 ? 'take' : 'takes'}</span></div>
    {compareTakes.length === 2 && <div className="tp-compare-strip"><div><GitCompareArrows size={16}/><span><strong>Compare A / B</strong><small>{formatDuration(compareTakes[0].duration)} vs {formatDuration(compareTakes[1].duration)} · {compareTakes[0].mimeType}</small></span></div><Button size="small" variant="ghost" onClick={() => setCompare([])}>Clear comparison</Button></div>}
    {loading ? <div className="tp-takes-empty"><span className="tp-loader"/><p>Loading takes…</p></div> : takes.length === 0 ? <div className="tp-takes-empty"><Film size={27}/><strong>No takes yet.</strong><p>Your first recorded performance will appear here, with its script cursor and capture settings attached.</p></div> : <div className="tp-take-list">{takes.map((take, index) => <article className={`tp-take-card ${take.starred ? 'is-starred' : ''} ${compare.includes(take.id) ? 'is-compared' : ''}`} key={take.id}><div className="tp-take-index mono">{String(takes.length - index).padStart(2, '0')}</div><div className="tp-take-main"><div className="tp-take-title"><h3>{take.title || `Take ${takes.length - index}`}</h3>{take.starred && <Heart size={14} fill="currentColor"/>}<span className={`tp-status tp-status-${take.status}`}>{take.status === 'complete' && take.playable !== false ? 'Playable' : take.status}</span></div><div className="tp-take-meta"><span className="mono">{new Date(take.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><span>{formatDuration(take.duration)}</span><span>{Math.round(take.bytes / 1024)} KB</span><span>{take.mimeType.replace('video/', '')}</span><span>from word {take.startWord + 1}</span></div>{take.error && <p className="tp-take-error">{take.error}</p>}<div className="tp-take-actions"><Button size="small" variant="primary" disabled={take.status !== 'complete' || take.playable === false} onClick={() => onEdit(take)}><WandSparkles size={14}/> AutoEdit this take</Button><Button size="small" variant="secondary" disabled={!take.bytes || take.status === 'recording'} onClick={() => onDownload(take)}><Download size={14}/> {take.status === 'complete' ? 'Download original' : 'Download recovered bytes'}</Button><Button size="small" variant="ghost" onClick={() => onRetake(take)}><RotateCcw size={14}/> Retake this section</Button><IconButton label={take.starred ? 'Remove favourite' : 'Favourite take'} onClick={() => onStar(take)}><Heart size={15} fill={take.starred ? 'currentColor' : 'none'}/></IconButton><IconButton label={compare.includes(take.id) ? 'Remove from compare' : 'Compare this take'} onClick={() => toggleCompare(take.id)}><GitCompareArrows size={15}/></IconButton><IconButton label="Delete take" onClick={() => onDelete(take)}><Trash2 size={15}/></IconButton></div></div></article>)}</div>}
    <p className="tp-takes-foot"><Check size={15}/> All media stays in this browser’s local recording library. AutoEdit creates a new project and leaves this original available.</p>
  </section>
}
