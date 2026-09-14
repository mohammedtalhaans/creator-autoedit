import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Download, FileText, FolderOpen, Search, Sparkles, Star, Trash2, Upload, WandSparkles } from 'lucide-react'
import type { PromptSettings, ScriptDocument } from '../../types/recording'
import { formatDuration, parsePrompt } from '../../features/teleprompter/text'
import { buildPromptTiming } from '../../features/teleprompter/timing'
import { importPromptFile } from '../../features/teleprompter/recordingBridge'
import { Button, IconButton } from '../ui/primitives'
import { PromptQuickControls } from './PromptReader'
import { PromptSettingsPanel } from './PromptSettingsPanel'

interface ScriptPanelProps {
  scripts: ScriptDocument[]
  active: ScriptDocument
  onSelect: (id: string) => void
  onChange: (patch: Partial<ScriptDocument>) => void
  onCreate: () => void
  onDelete: () => void
  onImport: (result: { title: string; text: string }) => void
  onGenerate: (request: { mode: 'rewrite' | 'topic'; brief: string; tone: string; targetSeconds: number }) => void
  onCancelGenerate: () => void
  aiBusy: boolean
  aiDraft: string | null
  onApplyDraft: () => void
  onDiscardDraft: () => void
}

const PRACTICE_SCRIPT = `Your ideas deserve a clear voice.\n\n[PAUSE]\n\nTake a breath, find the reading line, and let the words move at your pace.`

export function ScriptPanel({ scripts, active, onSelect, onChange, onCreate, onDelete, onImport, onGenerate, onCancelGenerate, aiBusy, aiDraft, onApplyDraft, onDiscardDraft }: ScriptPanelProps) {
  const [query, setQuery] = useState('')
  const [showLibrary, setShowLibrary] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [aiMode, setAiMode] = useState<'rewrite' | 'topic'>('rewrite')
  const [aiBrief, setAiBrief] = useState('')
  const [aiTone, setAiTone] = useState('natural and conversational')
  const [aiTargetSeconds, setAiTargetSeconds] = useState(30)
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parsePrompt(active.text), [active.text])
  const timing = useMemo(() => buildPromptTiming(parsed, active.settings), [active.settings, parsed])
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  const updateText = (text: string) => {
    onChange({ text })
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => onChange({ text }), 500)
  }
  const filtered = scripts.filter((script) => !query.trim() || `${script.title} ${script.text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const download = (extension: 'txt' | 'md') => {
    const blob = new Blob([active.text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${active.title || 'script'}.${extension}`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return <aside className="tp-script-panel">
    <div className="tp-panel-header"><div><span className="eyebrow-small">SCRIPT DESK</span><h2>Shape the words before you roll.</h2></div><span className="tp-script-count mono">{scripts.length} saved</span></div>
    <div className="tp-library-toggle"><button type="button" onClick={() => setShowLibrary((open) => !open)} aria-expanded={showLibrary}><FolderOpen size={16}/> Script library <span className="mono">{showLibrary ? 'HIDE' : 'SHOW'}</span></button><Button size="small" variant="primary" onClick={onCreate}><BookOpen size={14}/> New script</Button></div>
    {showLibrary && <div className="tp-library"><label className="tp-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scripts" aria-label="Search scripts"/></label><div className="tp-script-list">{filtered.map((script) => <button type="button" key={script.id} className={script.id === active.id ? 'is-selected' : ''} onClick={() => onSelect(script.id)}><span className="tp-script-list-title">{script.title || 'Untitled script'}</span><span className="mono">{parsePrompt(script.text).words} words</span></button>)}{filtered.length === 0 && <p className="tp-empty-library">No scripts match this search.</p>}</div></div>}

    <div className="tp-script-editor">
      <label className="tp-title-field"><span>Title</span><input value={active.title} onChange={(event) => onChange({ title: event.target.value })} onBlur={() => onChange({ title: active.title.trim() || 'Untitled script' })} placeholder="Untitled script"/></label>
      <label className="tp-body-field"><span><span>Script</span><span className="mono">{parsed.words} words · ~{formatDuration(timing.estimatedSeconds)}</span></span><textarea value={active.text} onChange={(event) => updateText(event.target.value)} placeholder={'Paste or type your words here…\n\nUse [PAUSE], [SMILE], or [B-ROLL] as private director cues. Use **bold** for emphasis.'} spellCheck /></label>
      <div className="tp-script-actions"><Button size="small" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14}/> Import</Button><Button size="small" variant="ghost" onClick={() => download('txt')}><Download size={14}/> Backup .txt</Button><Button size="small" variant="ghost" onClick={() => download('md')}><FileText size={14}/> .md</Button><Button size="small" variant="ghost" onClick={() => onChange({ title: 'Practice script', text: PRACTICE_SCRIPT, cursor: 0 })}><Sparkles size={14}/> Try a practice script</Button><IconButton label="Delete this script" onClick={onDelete}><Trash2 size={15}/></IconButton><input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importPromptFile(file).then(onImport) }}/></div>
      <div className="tp-bookmark-row"><button type="button" onClick={() => { const next = active.bookmarks.includes(active.cursor) ? active.bookmarks.filter((index) => index !== active.cursor) : [...active.bookmarks, active.cursor].sort((a, b) => a - b); onChange({ bookmarks: next }) }}><Star size={14} fill={active.bookmarks.includes(active.cursor) ? 'currentColor' : 'none'}/> {active.bookmarks.includes(active.cursor) ? 'Bookmarked start word' : 'Bookmark current word'}</button><span className="mono">{active.bookmarks.length} bookmarks</span></div>
      <div className="tp-ai-card"><div className="tp-ai-card-head"><div><span className="eyebrow-small"><Sparkles size={12}/> LOCAL WRITING ASSIST</span><strong>Draft privately on this device</strong></div><span className="mono">OPTIONAL</span></div><p>Nothing leaves this browser. Your original stays untouched until you apply a draft.</p><div className="tp-ai-mode" role="group" aria-label="Writing assist mode"><button type="button" className={aiMode === 'rewrite' ? 'selected' : ''} aria-pressed={aiMode === 'rewrite'} onClick={() => setAiMode('rewrite')}>Rewrite script</button><button type="button" className={aiMode === 'topic' ? 'selected' : ''} aria-pressed={aiMode === 'topic'} onClick={() => setAiMode('topic')}>From a topic</button></div>{aiMode === 'topic' && <textarea className="tp-ai-brief" value={aiBrief} onChange={(event) => setAiBrief(event.target.value)} placeholder={'What should the creator say?\nExample: explain why local editing matters.'} aria-label="Topic brief"/>}<div className="tp-ai-options"><label><span>Tone</span><select value={aiTone} onChange={(event) => setAiTone(event.target.value)}><option>natural and conversational</option><option>clear and concise</option><option>playful and warm</option><option>confident and direct</option></select></label><label><span>Length</span><select value={aiTargetSeconds} onChange={(event) => setAiTargetSeconds(Number(event.target.value))}><option value="15">15 sec</option><option value="30">30 sec</option><option value="60">60 sec</option><option value="90">90 sec</option></select></label></div><div className="tp-ai-actions"><Button size="small" variant="secondary" disabled={aiBusy || (aiMode === 'rewrite' ? parsed.words < 8 : aiBrief.trim().length < 8)} onClick={() => onGenerate({ mode: aiMode, brief: aiBrief.trim(), tone: aiTone, targetSeconds: aiTargetSeconds })}><WandSparkles size={14}/>{aiBusy ? 'Drafting…' : aiMode === 'topic' ? 'Draft from topic' : 'Rewrite script'}</Button>{aiBusy && <Button size="small" variant="ghost" onClick={onCancelGenerate}>Cancel</Button>}</div>{aiMode === 'rewrite' && parsed.words < 8 && <p className="tp-ai-hint">Add at least eight words to enable a rewrite, or switch to From a topic.</p>}{aiDraft && <div className="tp-draft"><span className="mono">DRAFT PREVIEW · ORIGINAL UNCHANGED</span><p>{aiDraft}</p><div><Button size="small" variant="primary" onClick={onApplyDraft}>Apply draft</Button><Button size="small" variant="ghost" onClick={onDiscardDraft}>Discard</Button></div></div>}</div>
    </div>

    <div className="tp-settings-toggle"><button type="button" onClick={() => setShowSettings((open) => !open)} aria-expanded={showSettings}><span className="eyebrow-small">READER SETTINGS</span><span className="mono">{showSettings ? 'COLLAPSE' : 'EXPAND'}</span></button></div>
    {showSettings ? <PromptSettingsPanel settings={active.settings} onChange={(settings: Partial<PromptSettings>) => onChange({ settings: { ...active.settings, ...settings } })}/> : <div className="tp-essential-settings"><span className="eyebrow-small">ESSENTIAL PACE</span><PromptQuickControls settings={active.settings} onChange={(settings) => onChange({ settings: { ...active.settings, ...settings } })}/><button type="button" onClick={() => setShowSettings(true)}>Open advanced settings</button></div>}
  </aside>
}
