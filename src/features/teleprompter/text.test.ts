import { describe, expect, it } from 'vitest'
import { parsePrompt, spokenText } from './text'
import { buildPromptTiming, observedWpm } from './timing'
import { defaultPromptSettings } from '../recording/defaults'

describe('prompt parsing and timing', () => {
  it('keeps cues, speakers, chapters, and emphasis visible while excluding cues from words', () => {
    const parsed = parsePrompt('# Chapter one\n\nHOST: Welcome to **Signal**.\n\n[SMILE]\n\nThis stays spoken.')
    expect(parsed.blocks.map((block) => block.kind)).toEqual(['chapter', 'speaker', 'cue', 'paragraph'])
    expect(parsed.words).toBe(6)
    expect(spokenText(parsed.source)).toContain('Welcome')
    expect(spokenText(parsed.source)).not.toContain('SMILE')
  })

  it('supports punctuation, optional cue pauses, and observed rehearsal speed', () => {
    const parsed = parsePrompt('One, two.\n\n[PAUSE]\n\nThree!')
    const settings = { ...defaultPromptSettings, mode: 'fixed' as const, wpm: 120, autoPause: true }
    const withCue = buildPromptTiming(parsed, settings, { includeCuePauses: true })
    const withoutCue = buildPromptTiming(parsed, { ...settings, autoPause: false }, { includeCuePauses: false })
    expect(withCue.estimatedSeconds).toBeGreaterThan(withoutCue.estimatedSeconds)
    expect(withCue.punctuationSeconds).toBeGreaterThan(0)
    expect(observedWpm(60, 30)).toBe(120)
  })
})
