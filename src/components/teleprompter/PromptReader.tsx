import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Mic, Pause, Play, RotateCcw, Sparkles, Volume2 } from 'lucide-react'
import type { PromptSettings, ScriptDocument } from '../../types/recording'
import { buildPromptTiming, observedWpm } from '../../features/teleprompter/timing'
import { PromptMatcher } from '../../features/teleprompter/matcher'
import { getCueText, parsePrompt, type PromptToken } from '../../features/teleprompter/text'
import { LocalVoiceController, type VoiceStatus } from '../../features/teleprompter/localVoice'
import { formatDuration } from '../../features/teleprompter/text'
import { Button, IconButton, Slider, Switch } from '../ui/primitives'

export interface PromptReaderProps {
  script: ScriptDocument
  settings: PromptSettings
  onCursorChange: (cursor: number) => void
  stream?: MediaStream | null
  recording?: boolean
  onVoiceStatus?: (status: VoiceStatus, detail?: string) => void
  onObservedWpm?: (wpm: number) => void
  compact?: boolean
  /** Native capture status drives prompt start/stop without coupling media bytes. */
  captureActive?: boolean
}

function tokenClass(token: PromptToken, state: 'past' | 'current' | 'future', dim: boolean): string {
  if (!token.spoken) return `tp-token tp-${token.cue ? 'cue' : 'meta'}`
  return `tp-token tp-${state}${dim && state !== 'current' ? ' tp-dimmed' : ''}${token.emphasis ? ' tp-emphasis' : ''}`
}

function localMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('Microphone access is unavailable in this browser.'))
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
}

export function PromptReader({ script, settings, onCursorChange, stream = null, recording = false, onVoiceStatus, onObservedWpm, compact = false, captureActive = false }: PromptReaderProps) {
  const parsed = useMemo(() => parsePrompt(script.text), [script.text])
  const timing = useMemo(() => buildPromptTiming(parsed, settings, { includeCuePauses: settings.autoPause, densityTiming: settings.lineTiming }), [parsed, settings])
  const scrollRef = useRef<HTMLDivElement>(null)
  const tokenRefs = useRef(new Map<number, HTMLButtonElement>())
  const matcherRef = useRef<PromptMatcher | null>(null)
  const voiceRef = useRef(new LocalVoiceController())
  const ownMicRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const startCursorRef = useRef(0)
  const [cursor, setCursor] = useState(() => Math.max(0, Math.min(parsed.words - 1, script.cursor || 0)))
  const [playing, setPlaying] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [voiceDetail, setVoiceDetail] = useState('')
  const [voicePrepared, setVoicePrepared] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [level, setLevel] = useState(0)
  const [observed, setObserved] = useState(0)
  const [lastMatch, setLastMatch] = useState('')

  const scrollToToken = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollRef.current
    const token = tokenRefs.current.get(index)
    if (!container || !token) return
    const containerRect = container.getBoundingClientRect()
    const tokenRect = token.getBoundingClientRect()
    const anchor = container.clientHeight * (settings.readingLine / 100)
    const nextTop = container.scrollTop + tokenRect.top - containerRect.top - anchor + tokenRect.height / 2
    container.scrollTo({ top: Math.max(0, nextTop), behavior })
  }, [settings.readingLine])

  useEffect(() => {
    const position = Math.max(0, Math.min(parsed.words - 1, script.cursor || 0))
    setCursor(position)
    matcherRef.current = new PromptMatcher(parsed.spokenTokens, position)
    // Typography and column changes trigger a layout pass. Re-anchor the same
    // script token after the browser has measured the new line boxes.
    const id = window.requestAnimationFrame(() => scrollToToken(position, 'auto'))
    return () => window.cancelAnimationFrame(id)
  // Cursor changes are local reading updates; remounting the matcher for each
  // persisted cursor would erase its speech history. Script switches still
  // re-seed through parsed/script.id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, script.id])

  useEffect(() => {
    const id = window.requestAnimationFrame(() => scrollToToken(cursor, 'auto'))
    return () => window.cancelAnimationFrame(id)
  }, [cursor, scrollToToken, settings.columnWidth, settings.fontFamily, settings.fontSize, settings.letterSpacing, settings.lineHeight, settings.margin, settings.marginLeft, settings.marginRight])

  const setPosition = useCallback((next: number, behavior: ScrollBehavior = 'smooth', resetMatcher = false) => {
    const clamped = Math.max(0, Math.min(Math.max(0, parsed.words - 1), Math.round(next)))
    setCursor(clamped)
    onCursorChange(clamped)
    if (resetMatcher) matcherRef.current?.seek(clamped)
    window.requestAnimationFrame(() => scrollToToken(clamped, behavior))
  }, [onCursorChange, parsed.words, scrollToToken])

  const stopScroll = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setPlaying(false)
  }, [])

  const tick = useCallback((timestamp: number) => {
    if (!startedAtRef.current || !parsed.words || settings.mode === 'manual' || settings.mode === 'voice') return
    const elapsed = Math.max(0, (timestamp - startedAtRef.current) / 1000)
    const duration = Math.max(1, timing.estimatedSeconds - (startCursorRef.current / Math.max(1, parsed.words)) * timing.estimatedSeconds)
    const progress = Math.min(1, elapsed / duration)
    const next = startCursorRef.current + progress * (parsed.words - startCursorRef.current)
    setPosition(next, 'auto')
    if (progress >= 1) { stopScroll(); return }
    rafRef.current = window.requestAnimationFrame(tick)
  }, [parsed.words, settings.mode, setPosition, stopScroll, timing.estimatedSeconds])

  const beginScroll = useCallback(() => {
    if (!parsed.words) return
    startCursorRef.current = cursor
    startedAtRef.current = performance.now()
    setPlaying(true)
    rafRef.current = window.requestAnimationFrame(tick)
  }, [cursor, parsed.words, tick])

  const togglePlay = useCallback(() => {
    if (playing) { stopScroll(); return }
    beginScroll()
  }, [beginScroll, playing, stopScroll])

  useEffect(() => {
    if (captureActive && settings.mode !== 'manual' && settings.mode !== 'voice') beginScroll()
    if (!captureActive) stopScroll()
    // Do not depend on `playing`: a user pause during a recording must remain
    // paused while the native recorder continues saving media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureActive])

  useEffect(() => () => stopScroll(), [stopScroll])

  const handleVoiceTranscript = useCallback((text: string, isFinal: boolean) => {
    const result = matcherRef.current?.process(text, isFinal)
    setLastMatch(result ? `${Math.round(result.score * 100)}% match` : 'Holding position')
    if (!result || !result.confident) return
    setPosition(result.end, 'smooth')
    if (isFinal && startedAtRef.current) {
      const activeSeconds = (performance.now() - startedAtRef.current) / 1000
      const spoken = Math.max(0, result.end - startCursorRef.current)
      const wpm = observedWpm(spoken, activeSeconds)
      if (wpm) { setObserved(wpm); onObservedWpm?.(wpm) }
    }
  }, [onObservedWpm, setPosition])

  const voiceCallbacks = useMemo(() => ({
    onStatus: (status: VoiceStatus, detail?: string) => { setVoiceStatus(status); setVoiceDetail(detail ?? ''); onVoiceStatus?.(status, detail) },
    onTranscript: handleVoiceTranscript,
    onLevel: setLevel,
  }), [handleVoiceTranscript, onVoiceStatus])

  const prepareVoice = useCallback(async () => {
    setVoiceError('')
    try {
      await voiceRef.current.prepare(voiceCallbacks)
      setVoicePrepared(true)
    } catch (error) { setVoiceError(error instanceof Error ? error.message : String(error)) }
  }, [voiceCallbacks])

  const startVoice = useCallback(async () => {
    setVoiceError('')
    try {
      const source = stream ?? (ownMicRef.current = await localMicStream())
      await voiceRef.current.start(source, voiceCallbacks)
      setVoicePrepared(true)
    } catch (error) { setVoiceError(error instanceof Error ? error.message : String(error)); onVoiceStatus?.('error', String(error)) }
  }, [onVoiceStatus, stream, voiceCallbacks])

  const stopVoice = useCallback(async () => {
    await voiceRef.current.stop()
    ownMicRef.current?.getTracks().forEach((track) => track.stop())
    ownMicRef.current = null
  }, [])

  useEffect(() => () => { void voiceRef.current.stop(); ownMicRef.current?.getTracks().forEach((track) => track.stop()) }, [])

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget && (event.target as HTMLElement).tagName !== 'BUTTON') return
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); togglePlay() }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setPosition(cursor + 1, 'smooth', true) }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setPosition(cursor - 1, 'smooth', true) }
    else if (event.key === 'Home') { event.preventDefault(); setPosition(0, 'smooth', true) }
    else if (event.key === 'End') { event.preventDefault(); setPosition(parsed.words - 1, 'smooth', true) }
  }

  const registerToken = (index: number) => (element: HTMLButtonElement | null) => {
    if (element) tokenRefs.current.set(index, element)
    else tokenRefs.current.delete(index)
  }
  const activeToken = parsed.spokenTokens[cursor]
  const wordsSpoken = parsed.spokenTokens.slice(0, cursor).length
  const readerStyle: CSSProperties = {
    '--tp-text': settings.textColor,
    '--tp-bg': settings.backgroundColor,
    '--tp-bg-opacity': settings.backgroundOpacity,
    '--tp-size': `${settings.fontSize}px`,
    '--tp-line': settings.lineHeight,
    '--tp-track': `${settings.letterSpacing}px`,
    '--tp-column': `${settings.columnWidth}%`,
    '--tp-margin': `${settings.margin}%`,
    '--tp-margin-left': `${settings.marginLeft ?? settings.margin}%`,
    '--tp-margin-right': `${settings.marginRight ?? settings.margin}%`,
    '--tp-hpos': settings.horizontalPosition ?? .5,
    '--tp-offset': `calc((100% - var(--tp-column)) * (${(settings.horizontalPosition ?? .5) - .5}))`,
    '--tp-reading-line': `${settings.readingLine}%`,
    '--tp-opacity': settings.dimSurrounding ? '.34' : '1',
    fontFamily: settings.fontFamily,
    fontWeight: settings.bold ? 650 : 450,
  } as CSSProperties

  return <div className={`tp-reader-wrap ${compact ? 'tp-reader-compact' : ''}`}>
    <div className="tp-reader-head">
      <div className="tp-reader-meta"><span className="tp-live-dot"/><span className="mono">{settings.mode.toUpperCase()} PROMPT</span><span className="tp-divider"/><span>{parsed.words.toLocaleString()} spoken words</span></div>
      <div className="tp-reader-stats"><span className="mono">{formatDuration(timing.estimatedSeconds)}</span>{observed > 0 && <span className="tp-observed"><Volume2 size={13}/> {observed} WPM live</span>}</div>
    </div>
    <div className="tp-reading-stage" style={readerStyle} onKeyDown={keyDown} tabIndex={0} role="region" aria-label="Teleprompter reader">
      <div className="tp-reading-line" aria-hidden="true"><span/></div>
      <div className="tp-script-scroll" ref={scrollRef}>
        <div className="tp-script-column">
          <div className="tp-anchor-spacer" aria-hidden="true"/>
          {parsed.blocks.map((block) => {
            const firstSpoken = block.tokens.find((token) => token.spoken)
            const firstPosition = firstSpoken ? parsed.spokenTokens.findIndex((token) => token.index === firstSpoken.index) : -1
            return <section className={`tp-block tp-block-${block.kind}`} key={block.id}>
              {block.kind === 'chapter' && <div className="tp-chapter"><span className="mono">CHAPTER</span><strong>{block.chapter}</strong></div>}
              {block.kind === 'speaker' && <div className="tp-speaker mono">{block.speaker}</div>}
              {block.kind === 'cue' ? <div className="tp-cue-label"><span className="tp-cue-bracket">[</span>{getCueText(block.text)}<span className="tp-cue-bracket">]</span></div> : <p>
                {block.tokens.map((token) => {
                  const spokenIndex = token.spoken ? parsed.spokenTokens.findIndex((item) => item.index === token.index) : -1
                  const state = !token.spoken ? 'future' : spokenIndex < cursor ? 'past' : spokenIndex === cursor ? 'current' : 'future'
                  const activeLine = token.spoken && activeToken && token.paragraph === activeToken.paragraph && token.sentence === activeToken.sentence
                  return <span key={token.index}><button ref={token.spoken ? registerToken(spokenIndex) : undefined} type="button" className={`${tokenClass(token, state, settings.dimSurrounding)}${activeLine ? ' tp-active-line' : ''}`} onClick={() => token.spoken && setPosition(spokenIndex, 'smooth', true)} aria-current={state === 'current' ? 'true' : undefined}>{token.text}</button>{token.spoken ? ' ' : ''}</span>
                })}
              </p>}
              {firstPosition >= 0 && firstPosition === cursor && <span className="tp-block-marker" aria-hidden="true">NOW</span>}
            </section>
          })}
          <div className="tp-anchor-spacer tp-anchor-bottom" aria-hidden="true"/>
        </div>
      </div>
      {!parsed.words && <div className="tp-empty-reader"><Sparkles size={18}/><strong>Your reading line is ready.</strong><span>Paste a script on the left to begin.</span></div>}
    </div>
    <div className="tp-reader-controls">
      <div className="tp-transport">
        <IconButton label="Restart at selected word" onClick={() => setPosition(0, 'smooth', true)}><RotateCcw size={17}/></IconButton>
        <Button className="tp-play" variant="primary" onClick={togglePlay} disabled={!parsed.words || settings.mode === 'voice'}>{playing ? <Pause size={17}/> : <Play size={17}/>} {playing ? 'Pause prompt' : settings.mode === 'manual' ? 'Start manual read' : settings.mode === 'voice' ? 'Start voice-follow below' : 'Play prompt'}</Button>
        <span className="tp-transport-hint mono">SPACE · ARROWS TO MOVE</span>
        <span className="tp-position mono">{parsed.words ? `${Math.round((cursor / Math.max(1, parsed.words - 1)) * 100)}%` : '0%'}</span>
      </div>
      {(!compact || settings.mode === 'voice') && <div className="tp-voice-row">
        <div className={`tp-voice-meter ${voiceStatus === 'listening' ? 'is-active' : ''}`}><span style={{ transform: `scaleY(${Math.max(.12, level)})` }}/></div>
        <div className="tp-voice-copy"><strong>{voiceStatus === 'listening' ? 'Voice-follow is listening' : voiceStatus === 'preparing' ? 'Preparing local voice-follow' : 'Optional local voice-follow'}</strong><span>{lastMatch || voiceDetail || (recording ? 'Uses the active microphone track; the script never enters the video.' : 'Read-only until you explicitly enable your microphone.')}</span></div>
        {!voicePrepared && <Button size="small" variant="secondary" onClick={() => void prepareVoice()}><Sparkles size={14}/> Prepare voice-follow</Button>}
        {voicePrepared && voiceStatus !== 'listening' && <Button size="small" variant="secondary" onClick={() => void startVoice()}><Mic size={14}/> Start voice-follow</Button>}
        {voiceStatus === 'listening' && <Button size="small" variant="ghost" onClick={() => void stopVoice()}>Stop voice-follow</Button>}
      </div>}
      {voiceError && <p className="tp-inline-error" role="status">{voiceError}</p>}
    </div>
    <div className="tp-reader-footer"><span>{activeToken ? `Reading: “${activeToken.text}”` : 'Tap any word to set your start point.'}</span><span className="mono">{wordsSpoken} / {parsed.words} WORDS</span></div>
  </div>
}

export function PromptQuickControls({ settings, onChange }: { settings: PromptSettings; onChange: (patch: Partial<PromptSettings>) => void }) {
  return <div className="tp-quick-controls">
    <Slider label="Speed" value={settings.wpm} min={50} max={260} step={5} display={`${settings.wpm} WPM`} onChange={(wpm) => onChange({ wpm })}/>
    <Slider label="Text size" value={settings.fontSize} min={28} max={84} step={1} display={`${settings.fontSize}px`} onChange={(fontSize) => onChange({ fontSize })}/>
    <Slider label="Reading line" value={settings.readingLine} min={10} max={65} step={1} display={`${settings.readingLine}%`} onChange={(readingLine) => onChange({ readingLine })}/>
    <Switch label="Bold words" checked={settings.bold} onChange={(bold) => onChange({ bold })}/>
  </div>
}
