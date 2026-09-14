import type { PromptMode, PromptSettings } from '../../types/recording'
import type { ParsedPrompt, PromptBlock } from './text'

export interface TimingOptions {
  includeCuePauses?: boolean
  densityTiming?: boolean
}

export interface PromptTiming {
  mode: PromptMode
  wpm: number
  targetSeconds: number
  estimatedSeconds: number
  wordSeconds: number
  punctuationSeconds: number
  cueSeconds: number
  blockSeconds: Map<string, number>
  tokenSeconds: Map<number, number>
}

function safeWpm(wpm: number): number {
  return Math.max(30, Math.min(420, Number.isFinite(wpm) ? wpm : 130))
}

function punctuationPause(text: string, settings: PromptSettings): number {
  if (!settings.punctuation) return 0
  const commas = (text.match(/[,;:]/g) ?? []).length
  const stops = (text.match(/[.!?]/g) ?? []).length
  return commas * Math.max(0, settings.commaPause) + stops * Math.max(0, settings.periodPause)
}

function blockCueSeconds(block: PromptBlock, settings: PromptSettings): number {
  if (block.kind !== 'cue' || !block.cue) return 0
  const label = block.cue.toLocaleLowerCase()
  if (/pause|beat|breathe|hold|silence|wait/.test(label)) return Math.max(0, settings.paragraphPause)
  return 0
}

function blockDensity(block: PromptBlock): number {
  // A short block needs a little more settling time than a long paragraph.
  // This keeps density timing useful without pretending to know the performer's
  // delivery style.
  const words = block.tokens.filter((token) => token.spoken).length
  return words <= 4 ? 1.12 : words <= 10 ? 1.05 : 1
}

/**
 * Build a deterministic reading clock. Cues remain visible in the UI but are
 * excluded from word count and estimated duration unless the user explicitly
 * enables cue pauses.
 */
export function buildPromptTiming(parsed: ParsedPrompt, settings: PromptSettings, options: TimingOptions = {}): PromptTiming {
  const wpm = settings.mode === 'timed' && settings.targetSeconds > 0
    ? Math.max(30, (parsed.words * 60) / settings.targetSeconds)
    : safeWpm(settings.wpm)
  const wordSeconds = 60 / wpm
  let punctuationSeconds = 0
  let cueSeconds = 0
  const blockSeconds = new Map<string, number>()
  const tokenSeconds = new Map<number, number>()

  for (const block of parsed.blocks) {
    const spoken = block.tokens.filter((token) => token.spoken)
    const punctuation = punctuationPause(block.text, settings)
    const cue = options.includeCuePauses ? blockCueSeconds(block, settings) : 0
    const density = options.densityTiming || settings.lineTiming ? blockDensity(block) : 1
    const spokenDuration = spoken.length * wordSeconds * density
    const total = spokenDuration + punctuation + cue
    blockSeconds.set(block.id, total)
    punctuationSeconds += punctuation
    cueSeconds += cue
    const perToken = spoken.length > 0 ? spokenDuration / spoken.length : 0
    for (const token of spoken) tokenSeconds.set(token.index, perToken)
  }

  const estimatedSeconds = parsed.words * wordSeconds + punctuationSeconds + cueSeconds
  const targetSeconds = settings.mode === 'timed' ? Math.max(1, settings.targetSeconds) : estimatedSeconds
  return { mode: settings.mode, wpm, targetSeconds, estimatedSeconds, wordSeconds, punctuationSeconds, cueSeconds, blockSeconds, tokenSeconds }
}

export function observedWpm(spokenWords: number, activeSeconds: number): number {
  if (spokenWords <= 0 || activeSeconds <= 0) return 0
  return Math.round((spokenWords / activeSeconds) * 60)
}

export function tokenProgress(parsed: ParsedPrompt, tokenIndex: number): number {
  if (parsed.words <= 1) return parsed.words ? 1 : 0
  const spokenPosition = parsed.spokenTokens.findIndex((token) => token.index === tokenIndex)
  return Math.max(0, Math.min(1, (spokenPosition < 0 ? 0 : spokenPosition) / (parsed.words - 1)))
}

export function paragraphProgress(parsed: ParsedPrompt, paragraph: number): number {
  const spoken = parsed.spokenTokens.filter((token) => token.paragraph < paragraph).length
  return parsed.words ? Math.max(0, Math.min(1, spoken / parsed.words)) : 0
}
