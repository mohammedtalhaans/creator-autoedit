import { doubleMetaphone } from 'double-metaphone'
import type { PromptToken } from './text'

export interface SpeechMatchOptions {
  threshold?: number
  lookback?: number
  lookahead?: number
  farJumpDistance?: number
  localityHalvingDistance?: number
}

export interface MatchResult {
  start: number
  end: number
  score: number
  rawScore: number
  evidence: number
  direction: 'forward' | 'backward' | 'same'
  confident: boolean
}

export interface MatcherState {
  cursor: number
  confirmed: number
  confidence: number
  lastTranscript: string
  held: boolean
  hypotheses: Array<{ position: number; score: number; age: number }>
}

const ARTICLE_OVERRIDES: Record<string, string> = { a: 'hw_art', the: 'hw_art', an: 'hw_and', and: 'hw_and' }
const CLEAN_RE = /[^\p{L}\p{N}'’-]+/gu

export function normalizeSpeechWord(value: string): string {
  return value.toLocaleLowerCase().replace(/[’]/g, "'").replace(CLEAN_RE, '').replace(/'/g, '')
}

/** Double Metaphone keeps common homophones usable when ASR chooses another spelling. */
export function phoneticToken(value: string): string {
  const clean = normalizeSpeechWord(value)
  if (!clean) return ''
  if (ARTICLE_OVERRIDES[clean]) return ARTICLE_OVERRIDES[clean]
  const codes = doubleMetaphone(clean)
  return codes[0] || codes[1] || clean
}

export function phoneticTokens(value: string): string[] {
  return value.split(/\s+/).map(phoneticToken).filter(Boolean)
}

export function tokeniseSpeech(value: string): string[] {
  return value.split(/\s+/).map(normalizeSpeechWord).filter(Boolean)
}

export function buildTokenIndex(tokens: string[]): Map<string, number[]> {
  const index = new Map<string, number[]>()
  tokens.forEach((token, position) => {
    const list = index.get(token)
    if (list) list.push(position)
    else index.set(token, [position])
  })
  return index
}

/** Banded word-level Levenshtein similarity, adapted from promptme-ai (MIT). */
export function bandedSimilarity(source: string[], target: string[], maxEdits = Math.ceil(Math.max(source.length, target.length) * 0.55)): number {
  if (!source.length || !target.length) return 0
  const maxLength = Math.max(source.length, target.length)
  if (Math.abs(source.length - target.length) > maxEdits) return Math.max(0, 1 - Math.abs(source.length - target.length) / maxLength)

  let previous = new Int16Array(target.length + 1)
  let current = new Int16Array(target.length + 1)
  for (let j = 0; j <= target.length; j++) previous[j] = j
  for (let i = 1; i <= source.length; i++) {
    current[0] = i
    const start = Math.max(1, i - maxEdits)
    const end = Math.min(target.length, i + maxEdits)
    if (start > 1) current[start - 1] = maxEdits + 1
    if (end < target.length) current[end + 1] = maxEdits + 1
    let rowMin = maxEdits + 1
    for (let j = start; j <= end; j++) {
      current[j] = source[i - 1] === target[j - 1]
        ? previous[j - 1]
        : 1 + Math.min(previous[j - 1], previous[j], current[j - 1])
      rowMin = Math.min(rowMin, current[j])
    }
    if (rowMin > maxEdits) return Math.max(0, 1 - (maxEdits + 1) / maxLength)
    const swap = previous
    previous = current
    current = swap
  }
  return Math.max(0, 1 - previous[target.length] / maxLength)
}

function scoreWindow(spoken: string[], script: string[], start: number): { score: number; end: number; evidence: number } {
  let best = { score: 0, end: start, evidence: 0 }
  const slack = Math.min(3, Math.max(1, Math.ceil(spoken.length * 0.28)))
  for (let delta = -slack; delta <= slack; delta++) {
    const length = Math.max(1, spoken.length + delta)
    const target = script.slice(start, start + length)
    if (!target.length) continue
    const score = bandedSimilarity(spoken, target)
    const targetSet = new Set(target)
    const evidence = spoken.reduce((count, token) => count + (targetSet.has(token) ? 1 : 0), 0)
    if (score > best.score) best = { score, end: Math.min(script.length - 1, start + length - 1), evidence }
    if (score >= 0.98) break
  }
  return best
}

function candidates(spoken: string[], index: Map<string, number[]>, current: number, lookback: number, lookahead: number): number[] {
  const set = new Set<number>()
  const from = Math.max(0, current - lookback)
  const to = current + lookahead + spoken.length
  spoken.forEach((token) => {
    for (const position of index.get(token) ?? []) {
      if (position < from || position > to) continue
      set.add(Math.max(0, position - 2))
      set.add(Math.max(0, position - 1))
      set.add(position)
    }
  })
  set.add(Math.max(0, current))
  return [...set].sort((a, b) => a - b)
}

/**
 * Match an ASR phrase against the nearby prompt. Locality makes repeated words
 * stable; a one-word result can never teleport across a script. Missing or
 * uncertain speech returns null so the reader can hold its cursor.
 */
export function matchSpeech(spokenText: string, scriptTokens: string[], currentPosition: number, options: SpeechMatchOptions = {}): MatchResult | null {
  const raw = tokeniseSpeech(spokenText)
  if (!raw.length || !scriptTokens.length) return null
  const script = scriptTokens.map(phoneticToken)
  const input = raw.map(phoneticToken)
  const clean = input.filter((token) => script.includes(token))
  const query = clean.length >= 2 ? clean : input
  if (!query.length) return null
  const lookback = options.lookback ?? 11
  const lookahead = options.lookahead ?? Math.max(25, query.length * 2)
  const farJumpDistance = options.farJumpDistance ?? 20
  const localityHalvingDistance = options.localityHalvingDistance ?? 20
  const index = buildTokenIndex(script)
  const threshold = options.threshold ?? 0.3
  let best: MatchResult | null = null
  let bestAdjusted = threshold - 0.01

  for (const start of candidates(query, index, currentPosition, lookback, lookahead)) {
    if (start >= script.length) continue
    const distance = start - currentPosition
    if (query.length < 2 && distance > farJumpDistance) continue
    const scored = scoreWindow(query, script, start)
    if (!scored.score) continue
    const locality = 1 / (1 + Math.max(0, distance) / localityHalvingDistance)
    const adjusted = scored.score * locality
    if (adjusted <= bestAdjusted) continue
    bestAdjusted = adjusted
    best = {
      start,
      end: scored.end,
      score: adjusted,
      rawScore: scored.score,
      evidence: scored.evidence,
      direction: scored.end > currentPosition ? 'forward' : scored.end < currentPosition ? 'backward' : 'same',
      confident: scored.score >= 0.62 && scored.evidence >= (query.length > 1 ? 2 : 1),
    }
  }
  return best
}

export class PromptMatcher {
  private readonly scriptTokens: PromptToken[]
  private readonly scriptWords: string[]
  private readonly history: string[] = []
  private readonly beam: Array<{ position: number; score: number; age: number }> = []
  private cursor = 0
  private confirmed = 0
  private confidence = 0
  private lastTranscript = ''
  private held = false

  constructor(tokens: PromptToken[], start = 0) {
    this.scriptTokens = tokens.filter((token) => token.spoken)
    this.scriptWords = this.scriptTokens.map((token) => token.normalized)
    this.reset(start)
  }

  getState(): MatcherState {
    return {
      cursor: this.cursor,
      confirmed: this.confirmed,
      confidence: this.confidence,
      lastTranscript: this.lastTranscript,
      held: this.held,
      hypotheses: this.beam.map((hypothesis) => ({ ...hypothesis })),
    }
  }

  reset(position = 0): void {
    const next = Math.max(0, Math.min(this.scriptTokens.length - 1, Math.round(position)))
    this.cursor = this.scriptTokens.length ? next : 0
    this.confirmed = this.cursor
    this.confidence = 0
    this.lastTranscript = ''
    this.held = false
    this.history.length = 0
    this.beam.length = 0
  }

  /** Explicit user seek: clears accumulated speech and beam history. */
  seek(position: number): void {
    this.reset(position)
  }

  process(transcript: string, isFinal = true): MatchResult | null {
    if (!transcript.trim() || !this.scriptWords.length) {
      this.held = true
      return null
    }
    const phrase = isFinal ? [...this.history.slice(-2), transcript].join(' ') : transcript
    const directMatch = matchSpeech(transcript, this.scriptWords, this.confirmed)
    const contextMatch = phrase === transcript ? null : matchSpeech(phrase, this.scriptWords, this.confirmed)
    // A fresh phrase is usually the cleanest anchor. Context remains useful for
    // short/garbled partials, but must not pull a repeated sentence backwards.
    const match = directMatch && (!contextMatch || directMatch.score >= contextMatch.score * 0.9)
      ? directMatch
      : contextMatch ?? directMatch
    this.lastTranscript = transcript
    if (isFinal) this.history.push(transcript)
    if (!match) {
      this.held = true
      for (const hypothesis of this.beam) {
        hypothesis.age++
        hypothesis.score *= 0.78
      }
      return null
    }

    const backward = match.end < this.confirmed
    const multiwordEvidence = match.evidence >= 2 || tokeniseSpeech(phrase).length >= 2
    const strongEnough = match.rawScore >= 0.48 && match.evidence >= 1
    // A short or uncertain result may refine a nearby cursor, but never causes a
    // distant jump. Backtracking always requires multiple words and high signal.
    if ((backward && (!multiwordEvidence || match.rawScore < 0.68)) || (!strongEnough && Math.abs(match.end - this.confirmed) > 4)) {
      this.held = true
      return match
    }

    const existing = this.beam.find((hypothesis) => Math.abs(hypothesis.position - match.end) <= 3)
    if (existing) {
      existing.score = Math.min(1, existing.score + match.score * 0.42)
      existing.position = Math.round(existing.position * 0.3 + match.end * 0.7)
      existing.age = 0
    } else if (match.confident || match.rawScore >= 0.55) {
      this.beam.push({ position: match.end, score: match.score, age: 0 })
    }
    this.beam.sort((a, b) => b.score - a.score)
    this.beam.splice(3)
    const winner = this.beam[0]
    // A confident forward anchor is allowed to outrank an older beam. Keeping
    // stale equal-scoring hypotheses forever would make repeated phrases stall
    // at the first occurrence instead of following the speaker.
    const next = match.end > this.confirmed && match.confident
      ? match.end
      : winner && winner.score >= 0.28 ? winner.position : match.end
    const previous = this.confirmed
    this.confirmed = Math.max(0, Math.min(this.scriptTokens.length - 1, next))
    this.cursor = this.confirmed
    this.confidence = match.score
    this.held = false
    return { ...match, end: this.confirmed, direction: this.confirmed > previous ? 'forward' : this.confirmed < previous ? 'backward' : 'same' }
  }
}
