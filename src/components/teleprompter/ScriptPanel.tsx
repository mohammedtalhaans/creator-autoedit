import { useMemo, useRef, useState } from 'react'
import { BookOpen, CircleHelp, Download, FileText, FolderOpen, Search, Star, Trash2, Upload } from 'lucide-react'
import type { PromptSettings, ScriptDocument } from '../../types/recording'
import { formatDuration, parsePrompt } from '../../features/teleprompter/text'
import { buildPromptTiming } from '../../features/teleprompter/timing'
import { importPromptFile } from '../../features/teleprompter/recordingBridge'
import { Button, IconButton, Input, Textarea } from '../ui/primitives'
import { PromptQuickControls } from './PromptReader'
import { PromptSettingsPanel } from './PromptSettingsPanel'

export interface ScriptPanelProps {
  scripts: ScriptDocument[]
  active: ScriptDocument
  onSelect: (id: string) => void
  onChange: (patch: Partial<ScriptDocument>) => void
  onCreate: () => void
  onDelete: () => void
  onImport: (result: { title: string; text: string }) => void
}

const PRACTICE_SCRIPT = `Your ideas deserve a clear voice.\n\n[PAUSE]\n\nTake a breath, find the reading line, and let the words move at your pace.`

export function ScriptPanel({ scripts, active, onSelect, onChange, onCreate, onDelete, onImport }: ScriptPanelProps) {
  const [query, setQuery] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parsePrompt(active.text), [active.text])
  const timing = useMemo(() => buildPromptTiming(parsed, active.settings), [active.settings, parsed])
  const filtered = scripts.filter((script) => !query.trim() || `${script.title} ${script.text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  const updateSettings = (patch: Partial<PromptSettings>) => onChange({ settings: { ...active.settings, ...patch } })
  const download = (extension: 'txt' | 'md') => {
    const blob = new Blob([active.text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${active.title || 'script'}.${extension}`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return <section className="tp-script-panel" aria-labelledby="script-step-heading">
    <header className="tp-panel-header">
      <div>
        <span className="eyebrow-small">SCRIPT</span>
        <h1 id="script-step-heading">Write what you want to say.</h1>
        <p className="tp-panel-intro">Keep the words close to the lens. Your prompt stays separate from the recording.</p>
      </div>
      <span className="tp-script-count mono">{scripts.length} saved</span>
    </header>

    <div className="tp-library-toggle">
      <Button variant="ghost" className="tp-library-toggle-button" onClick={() => setShowLibrary((open) => !open)} aria-expanded={showLibrary} aria-controls="tp-script-library">
        <FolderOpen size={16}/><span>Script library</span><span className="mono">{showLibrary ? 'HIDE' : 'SHOW'}</span>
      </Button>
      <Button size="small" variant="secondary" onClick={onCreate}><BookOpen size={14}/> New script</Button>
    </div>
    {showLibrary && <div className="tp-library" id="tp-script-library">
      <div className="tp-search"><Search size={15}/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved scripts" aria-label="Search scripts"/></div>
      <div className="tp-script-list" role="listbox" aria-label="Saved scripts">
        {filtered.map((script) => <Button variant="ghost" role="option" aria-selected={script.id === active.id} key={script.id} className={script.id === active.id ? 'is-selected' : ''} onClick={() => onSelect(script.id)}>
          <span className="tp-script-list-title">{script.title || 'Untitled script'}</span><span className="mono">{parsePrompt(script.text).words} words</span>
        </Button>)}
        {filtered.length === 0 && <p className="tp-empty-library">No scripts match this search.</p>}
      </div>
    </div>}

    <div className="tp-script-editor">
      <div className="tp-title-field"><Input label="Title" value={active.title} onChange={(event) => onChange({ title: event.target.value })} onBlur={() => onChange({ title: active.title.trim() || 'Untitled script' })} placeholder="Untitled script"/></div>
      <div className="tp-body-field">
        <div className="tp-field-caption"><span>Script</span><span className="mono">{parsed.words} words · ~{formatDuration(timing.estimatedSeconds)}</span></div>
        <Textarea value={active.text} onChange={(event) => onChange({ text: event.target.value })} placeholder={'Paste or type your words here…\n\nUse [PAUSE], [SMILE], or [B-ROLL] as private director cues.'} aria-label="Script text" spellCheck />
      </div>
      <div className="tp-script-actions">
        <Button size="small" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14}/> Import script</Button>
        <Button size="small" variant="ghost" onClick={() => download('txt')} disabled={!active.text.trim()}><Download size={14}/> Backup .txt</Button>
        <Button size="small" variant="ghost" onClick={() => download('md')} disabled={!active.text.trim()}><FileText size={14}/> .md</Button>
        <Button size="small" variant="ghost" onClick={() => onChange({ title: 'Practice script', text: PRACTICE_SCRIPT, cursor: 0 })}><FileText size={14}/> Try a practice script</Button>
        <IconButton label="Delete this script" onClick={onDelete}><Trash2 size={15}/></IconButton>
        <input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importPromptFile(file).then(onImport)
        }}/>
      </div>
      <div className="tp-bookmark-row"><Button variant="ghost" onClick={() => {
        const next = active.bookmarks.includes(active.cursor) ? active.bookmarks.filter((index) => index !== active.cursor) : [...active.bookmarks, active.cursor].sort((a, b) => a - b)
        onChange({ bookmarks: next })
      }}><Star size={14} fill={active.bookmarks.includes(active.cursor) ? 'currentColor' : 'none'}/> {active.bookmarks.includes(active.cursor) ? 'Bookmarked start word' : 'Bookmark current word'}</Button><span className="mono">{active.bookmarks.length} bookmarks</span></div>
    </div>

    <div className="tp-script-stats" aria-label="Script estimate">
      <div><span className="eyebrow-small">ESTIMATED READ</span><strong className="mono">{formatDuration(timing.estimatedSeconds)}</strong></div>
      <div><span className="eyebrow-small">PROMPT MODE</span><strong>{active.settings.mode === 'timed' ? `Finish in ${Math.round(active.settings.targetSeconds)} sec` : active.settings.mode === 'manual' ? 'Manual advance' : 'Fixed pace'}</strong></div>
      <div><span className="eyebrow-small">CUE HELP</span><strong>Private cues stay off camera</strong></div>
    </div>

    <div className="tp-cue-help" role="note">
      <CircleHelp size={17}/><div><strong>Use cues to direct yourself</strong><span>Type <code>[PAUSE]</code>, <code>[SMILE]</code>, or <code>[B-ROLL]</code>. They guide the prompt and never appear in your recorded video.</span></div>
    </div>

    <div className="tp-settings-toggle"><Button variant="ghost" className="tp-settings-toggle-button" onClick={() => setShowSettings((open) => !open)} aria-expanded={showSettings} aria-controls="tp-script-settings"><span className="eyebrow-small">PROMPT SETTINGS</span><span className="mono">{showSettings ? 'COLLAPSE' : 'EXPAND'}</span></Button></div>
    {showSettings ? <div id="tp-script-settings"><PromptSettingsPanel settings={active.settings} onChange={updateSettings}/></div> : <div className="tp-essential-settings"><span className="eyebrow-small">ESSENTIAL PACE</span><PromptQuickControls settings={active.settings} onChange={updateSettings}/><Button variant="link" size="small" className="tp-open-settings" onClick={() => setShowSettings(true)}>Open full prompt settings</Button></div>}
  </section>
}
