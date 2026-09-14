import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { FileText, Pause, Play, RotateCcw } from 'lucide-react'
import type { PromptSettings, ScriptDocument } from '../../types/recording'
import { buildPromptTiming } from '../../features/teleprompter/timing'
import { getCueText, parsePrompt, type PromptToken } from '../../features/teleprompter/text'
import { formatDuration } from '../../features/teleprompter/text'
import { Button, IconButton, Slider, Switch } from '../ui/primitives'

export interface PromptReaderProps {
  script: ScriptDocument
  settings: PromptSettings
  onCursorChange: (cursor: number) => void
  compact?: boolean
  /** Native capture status starts/stops fixed and timed scrolling. */
  captureActive?: boolean
  onPlayingChange?: (playing: boolean) => void
  /** Increment to toggle the prompt from the camera control bar. */
  toggleRequest?: number
  /** Recording uses the external capture bar for play/pause. */
  hideControls?: boolean
}

function tokenClass(token: PromptToken, state: 'past' | 'current' | 'future', dim: boolean): string {
  if (!token.spoken) return `tp-token tp-${token.cue ? 'cue' : 'meta'}`
  return `tp-token tp-${state}${dim && state !== 'current' ? ' tp-dimmed' : ''}${token.emphasis ? ' tp-emphasis' : ''}`
}

function promptBackground(color: string, opacity: number): string {
  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return color
  const hex = match[1].length === 3 ? match[1].split('').map((part) => part + part).join('') : match[1]
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${Math.max(0, Math.min(1, opacity))})`
}

export function PromptReader({ script, settings, onCursorChange, compact = false, captureActive = false, onPlayingChange, toggleRequest = 0, hideControls = false }: PromptReaderProps) {
  const parsed = useMemo(() => parsePrompt(script.text), [script.text])
  const timing = useMemo(() => buildPromptTiming(parsed, settings, { includeCuePauses: settings.autoPause, densityTiming: settings.lineTiming }), [parsed, settings])
  const scrollRef = useRef<HTMLDivElement>(null)
  const tokenRefs = useRef(new Map<number, HTMLButtonElement>())
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const startCursorRef = useRef(0)
  const lastToggleRef = useRef(toggleRequest)
  const [cursor, setCursor] = useState(() => Math.max(0, Math.min(Math.max(0, parsed.words - 1), script.cursor || 0)))
  const [playing, setPlaying] = useState(false)

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
    const position = Math.max(0, Math.min(Math.max(0, parsed.words - 1), script.cursor || 0))
    setCursor(position)
    const id = window.requestAnimationFrame(() => scrollToToken(position, 'auto'))
    return () => window.cancelAnimationFrame(id)
  // Cursor changes are local reading updates; script switches seed the new view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, script.id])

  useEffect(() => {
    const id = window.requestAnimationFrame(() => scrollToToken(cursor, 'auto'))
    return () => window.cancelAnimationFrame(id)
  }, [cursor, scrollToToken, settings.columnWidth, settings.fontFamily, settings.fontSize, settings.letterSpacing, settings.lineHeight, settings.margin, settings.marginLeft, settings.marginRight, settings.windowHeight, settings.textAlign, settings.showPrompt])

  const setPlayingState = useCallback((next: boolean) => {
    setPlaying(next)
    onPlayingChange?.(next)
  }, [onPlayingChange])

  const setPosition = useCallback((next: number, behavior: ScrollBehavior = 'smooth', resetClock = false) => {
    const clamped = Math.max(0, Math.min(Math.max(0, parsed.words - 1), Math.round(next)))
    setCursor(clamped)
    onCursorChange(clamped)
    if (resetClock) startedAtRef.current = null
    window.requestAnimationFrame(() => scrollToToken(clamped, behavior))
  }, [onCursorChange, parsed.words, scrollToToken])

  const stopScroll = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    startedAtRef.current = null
    setPlayingState(false)
  }, [setPlayingState])

  const beginManualNavigation = useCallback(() => {
    // Touching the transcript hands control to the presenter. Keep recording,
    // but stop automatic movement so the list cannot fight the user's drag.
    if (playing) stopScroll()
  }, [playing, stopScroll])

  const tick = useCallback((timestamp: number) => {
    if (startedAtRef.current === null || !parsed.words || settings.mode === 'manual') return
    const elapsed = Math.max(0, (timestamp - startedAtRef.current) / 1000)
    const duration = Math.max(1, timing.estimatedSeconds - (startCursorRef.current / Math.max(1, parsed.words)) * timing.estimatedSeconds)
    const progress = Math.min(1, elapsed / duration)
    const next = startCursorRef.current + progress * (parsed.words - startCursorRef.current)
    setPosition(next, 'auto')
    if (progress >= 1) { stopScroll(); return }
    rafRef.current = window.requestAnimationFrame(tick)
  }, [parsed.words, settings.mode, setPosition, stopScroll, timing.estimatedSeconds])

  const beginScroll = useCallback(() => {
    if (!parsed.words || settings.mode === 'manual') return
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    startCursorRef.current = cursor
    startedAtRef.current = performance.now()
    setPlayingState(true)
    rafRef.current = window.requestAnimationFrame(tick)
  }, [cursor, parsed.words, settings.mode, setPlayingState, tick])

  const togglePlay = useCallback(() => {
    if (playing) { stopScroll(); return }
    beginScroll()
  }, [beginScroll, playing, stopScroll])

  useEffect(() => {
    if (toggleRequest === lastToggleRef.current) return
    lastToggleRef.current = toggleRequest
    togglePlay()
  }, [togglePlay, toggleRequest])

  useEffect(() => {
    if (captureActive && settings.mode !== 'manual') beginScroll()
    if (!captureActive) stopScroll()
    // Do not depend on playing: a prompt pause must remain independent from capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureActive])

  useEffect(() => () => stopScroll(), [stopScroll])

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
  const modeLabel = settings.mode === 'timed' ? 'TIMED PROMPT' : settings.mode === 'manual' ? 'MANUAL PROMPT' : 'FIXED PROMPT'
  const playLabel = playing ? 'Pause prompt' : settings.mode === 'manual' ? 'Start manual read' : 'Play prompt'
  const backgroundColor = promptBackground(settings.backgroundColor, settings.backgroundOpacity)
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
    '--tp-window-height': `${Math.max(20, Math.min(65, settings.windowHeight ?? 34))}dvh`,
    '--tp-align': settings.textAlign ?? 'left',
    '--tp-mirror': settings.mirror ? -1 : 1,
    backgroundColor,
    fontFamily: settings.fontFamily,
    textAlign: settings.textAlign ?? 'left',
    fontWeight: settings.bold ? 650 : 450,
  } as CSSProperties

  return <div className={`tp-reader-wrap ${compact ? 'tp-reader-compact' : ''} ${hideControls ? 'tp-reader-no-controls' : ''} ${compact && settings.showPrompt === false ? 'tp-reader-hidden' : ''}`} aria-hidden={compact && settings.showPrompt === false ? 'true' : undefined}>
    <div className="tp-reader-head">
      <div className="tp-reader-meta"><span className="tp-live-dot"/><span className="mono">{modeLabel}</span><span className="tp-divider"/><span className="tp-reader-word-count">{parsed.words.toLocaleString()} spoken words</span>{compact && <span className="tp-reader-gesture-hint">Scroll · tap a word</span>}</div>
      <div className="tp-reader-stats"><span className="mono">{formatDuration(timing.estimatedSeconds)}</span></div>
    </div>
    <div className="tp-reading-stage" style={readerStyle} onKeyDown={keyDown} tabIndex={0} role="region" aria-label="Teleprompter reader">
      {settings.showReadingLine !== false && <div className="tp-reading-line" aria-hidden="true"><span/></div>}
      <div className="tp-script-scroll" ref={scrollRef} onPointerDown={beginManualNavigation}>
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
                  return <span key={token.index}><button ref={token.spoken ? registerToken(spokenIndex) : undefined} type="button" className={`${tokenClass(token, state, settings.dimSurrounding)}${activeLine ? ' tp-active-line' : ''}`} data-spoken-index={token.spoken ? spokenIndex : undefined} aria-label={token.spoken ? `Start prompt at ${token.text}` : undefined} onClick={() => token.spoken && setPosition(spokenIndex, 'smooth', true)} aria-current={state === 'current' ? 'true' : undefined}>{token.text}</button>{token.spoken ? ' ' : ''}</span>
                })}
              </p>}
              {firstPosition >= 0 && firstPosition === cursor && <span className="tp-block-marker" aria-hidden="true">NOW</span>}
            </section>
          })}
          <div className="tp-anchor-spacer tp-anchor-bottom" aria-hidden="true"/>
        </div>
      </div>
      {!parsed.words && <div className="tp-empty-reader"><FileText size={18}/><strong>Your reading line will appear here.</strong><span>Paste a script in the Script step to begin.</span></div>}
    </div>
    {!hideControls && <div className="tp-reader-controls">
      <div className="tp-transport">
        <IconButton label="Restart at the beginning" onClick={() => setPosition(0, 'smooth', true)}><RotateCcw size={17}/></IconButton>
        <Button className="tp-play" variant="primary" onClick={togglePlay} disabled={!parsed.words}>{playing ? <Pause size={17}/> : <Play size={17}/>} {playLabel}</Button>
        <span className="tp-transport-hint mono">SPACE · ARROWS TO MOVE</span>
        <span className="tp-position mono">{parsed.words ? `${Math.round((cursor / Math.max(1, parsed.words - 1)) * 100)}%` : '0%'}</span>
      </div>
    </div>}
    <div className="tp-reader-footer"><span>{activeToken ? `Reading: “${activeToken.text}”` : 'Tap a word to set your start point.'}</span><span className="mono">{wordsSpoken} / {parsed.words} WORDS</span></div>
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
