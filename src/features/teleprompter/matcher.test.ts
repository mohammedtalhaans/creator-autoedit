import { describe, expect, it } from 'vitest'
import { PromptMatcher, bandedSimilarity, matchSpeech, phoneticToken } from './matcher'
import { parsePrompt } from './text'

function matcherFor(text: string, start = 0) {
  const parsed = parsePrompt(text)
  return { parsed, matcher: new PromptMatcher(parsed.spokenTokens, start) }
}

describe('teleprompter speech matcher', () => {
  it('handles phonetic spellings and repeated phrases with locality', () => {
    expect(phoneticToken('right')).toBe(phoneticToken('write'))
    const { matcher } = matcherFor('We make the right choice. Then we make the right choice again.')
    const first = matcher.process('we make the right choice')
    expect(first?.end).toBeGreaterThan(2)
    const second = matcher.process('then we make the write choice again')
    expect(second?.end).toBeGreaterThan(first?.end ?? 0)
  })

  it('holds position on silence, missing words, and uncertain speech', () => {
    const { matcher } = matcherFor('A calm opening sentence. A clear second sentence.')
    const start = matcher.getState().cursor
    expect(matcher.process('')).toBeNull()
    expect(matcher.getState().cursor).toBe(start)
    expect(matcher.process('unrelated noise')).toBeNull()
    expect(matcher.getState().held).toBe(true)
  })

  it('recovers after a skipped sentence and accepts a multiword backtrack', () => {
    const { matcher } = matcherFor('Start here. The skipped sentence is not spoken. Return to the anchor and continue.')
    matcher.process('start here')
    const jumped = matcher.process('return to the anchor and continue')
    expect(jumped?.end).toBeGreaterThan(4)
    const back = matcher.process('start here')
    expect(back?.direction).toBe('backward')
    expect(matcher.getState().cursor).toBeLessThan(jumped?.end ?? Number.MAX_SAFE_INTEGER)
  })

  it('resets history when the reader selects a new word', () => {
    const { matcher } = matcherFor('One two three four five six seven')
    matcher.process('one two three')
    matcher.seek(5)
    expect(matcher.getState().cursor).toBe(5)
    expect(matcher.getState().lastTranscript).toBe('')
    expect(matcher.getState().hypotheses).toHaveLength(0)
  })

  it('scores skipped words without scanning every possible window', () => {
    const result = matchSpeech('hello final line', ['intro', 'hello', 'middle', 'final', 'line'], 0)
    expect(result?.end).toBeGreaterThanOrEqual(4)
    expect(bandedSimilarity(['a', 'b', 'c'], ['a', 'x', 'c'])).toBeGreaterThan(.5)
  })
})
