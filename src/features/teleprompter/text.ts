export { defaultPromptSettings } from '../recording/defaults'

/** A spoken word or an editorial marker in the authored prompt. */
export interface PromptToken {
  index: number
  text: string
  normalized: string
  spoken: boolean
  paragraph: number
  sentence: number
  cue?: string
  emphasis?: boolean
}

export interface PromptBlock {
  id: string
  kind: 'paragraph' | 'cue' | 'speaker' | 'chapter'
  text: string
  tokens: PromptToken[]
  paragraph: number
  speaker?: string
  cue?: string
  chapter?: string
}

export interface ParsedPrompt {
  source: string
  blocks: PromptBlock[]
  tokens: PromptToken[]
  spokenTokens: PromptToken[]
  words: number
  sentences: number
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu
const CUE_RE = /^\s*\[([^\]]+)\]\s*$/
const CHAPTER_RE = /^\s*(?:#{1,6}\s+|(?:chapter|part|section)\s+)(.+)$/i
const SPEAKER_RE = /^\s*([A-Z][A-Z0-9 _.'&-]{1,26}):\s*(.*)$/

export function normalizeText(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripMarkdown(text: string): string {
  return text.replace(/(```[\s\S]*?```|`[^`]+`)/g, '').replace(/[*_~]/g, '')
}

export function isCueText(text: string): boolean {
  return CUE_RE.test(text)
}

export function getCueText(text: string): string {
  return text.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
}

export function isChapterText(text: string): boolean {
  return CHAPTER_RE.test(text)
}

export function getChapterText(text: string): string {
  const match = CHAPTER_RE.exec(text)
  return match?.[1]?.trim() ?? text.trim()
}

function sentenceFor(text: string, start: number): number {
  let sentence = start
  for (const ch of text) if (ch === '.' || ch === '?' || ch === '!') sentence++
  return sentence
}

function makeWords(text: string, paragraph: number, sentenceStart: number, indexStart: number, spoken: boolean): PromptToken[] {
  const tokens: PromptToken[] = []
  let match: RegExpExecArray | null
  WORD_RE.lastIndex = 0
  while ((match = WORD_RE.exec(text))) {
    const raw = match[0]
    const normalized = raw.toLocaleLowerCase().replace(/[’']/g, "'")
    tokens.push({
      index: indexStart + tokens.length,
      text: raw,
      normalized,
      spoken,
      paragraph,
      sentence: sentenceFor(text.slice(0, match.index), sentenceStart),
      emphasis: false,
    })
  }
  return tokens
}

/**
 * Parse the small prompt markup used by Creator AutoEdit. Bracketed lines are
 * director cues, markdown headings are chapter markers, and `NAME:` prefixes
 * become speaker labels. Cue tokens are retained for display but excluded from
 * reading time and speech matching.
 */
export function parsePrompt(input: string): ParsedPrompt {
  const source = normalizeText(input)
  if (!source) return { source: '', blocks: [], tokens: [], spokenTokens: [], words: 0, sentences: 0 }

  const blocks: PromptBlock[] = []
  const tokens: PromptToken[] = []
  let paragraph = 0
  let sentence = 0
  const chunks = source.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean)

  chunks.forEach((chunk, chunkIndex) => {
    if (isCueText(chunk)) {
      const cue = getCueText(chunk)
      const cueTokens = makeWords(cue, paragraph, sentence, tokens.length, false).map((token) => ({ ...token, cue }))
      blocks.push({ id: `cue-${chunkIndex}`, kind: 'cue', text: cue, tokens: cueTokens, paragraph, cue })
      paragraph++
      return
    }

    if (isChapterText(chunk)) {
      const chapter = getChapterText(chunk)
      blocks.push({ id: `chapter-${chunkIndex}`, kind: 'chapter', text: chapter, tokens: [], paragraph, chapter })
      return
    }

    let body = stripMarkdown(chunk)
    let speaker: string | undefined
    const speakerMatch = SPEAKER_RE.exec(body)
    if (speakerMatch) {
      speaker = speakerMatch[1].trim()
      body = speakerMatch[2].trim()
    }
    const blockTokens = makeWords(body, paragraph, sentence, tokens.length, true)
    const emphasisMatches = [...chunk.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].toLocaleLowerCase())
    for (const token of blockTokens) token.emphasis = emphasisMatches.some((phrase) => phrase.includes(token.normalized))
    tokens.push(...blockTokens)
    blocks.push({ id: `paragraph-${chunkIndex}`, kind: speaker ? 'speaker' : 'paragraph', text: body, tokens: blockTokens, paragraph, speaker })
    sentence = sentenceFor(body, sentence)
    paragraph++
  })

  const spokenTokens = tokens.filter((token) => token.spoken)
  return { source, blocks, tokens, spokenTokens, words: spokenTokens.length, sentences: Math.max(1, sentence || (spokenTokens.length ? 1 : 0)) }
}

export function spokenText(input: string): string {
  return parsePrompt(input).spokenTokens.map((token) => token.text).join(' ')
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
