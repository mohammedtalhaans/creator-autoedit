import { describe, it, expect } from 'vitest';
import { groupWords, correctPhrase, normalizeChunks, outputPhrases, captionY, defaultCaptions } from './index';
import { EditMap } from '../edit-map';
const words = 'This is a beautiful little sentence. Here is another thought'.split(' ').map((text, i) => ({ id: `w${i}`, text, start: i * .4, end: (i + 1) * .4 }));
describe('caption timing and correction', () => {
    it('limits short-form phrases to four words', () => { expect(groupWords(words).every(p => p.words.length <= 4)).toBe(true); });
    it('respects punctuation and speech pauses', () => { const phrases = groupWords(words, 9, 100); expect(phrases[0].words.at(-1)!.text.endsWith('.')).toBe(true); });
    it('preserves exact timing for same-length edits', () => { const revised = correctPhrase(words, ['w0', 'w1'], 'They are'); expect(revised[0]).toEqual({ ...words[0], text: 'They' }); expect(revised[1]).toEqual({ ...words[1], text: 'are' }); });
    it('interpolates phrase replacements across their original interval', () => { const revised = correctPhrase(words, ['w0', 'w1'], 'We really are'); expect(revised[0].start).toBe(0); expect(revised[2].end).toBe(.8); expect(revised[3].id).toBe('w2'); });
    it('supports deleting a caption phrase', () => { expect(correctPhrase(words, ['w0', 'w1'], '')).toHaveLength(words.length - 2); });
    it('handles missing timestamps without losing source offsets', () => { const w = normalizeChunks([{ text: 'Hello there', timestamp: [.2, null] }], 2, 30); expect(w[0].start).toBe(30.2); expect(w.at(-1)!.end).toBe(32); });
    it('remaps captions via the EDL', () => { const m = EditMap.fromCuts(5, [{ id: 'x', start: 0, end: .8, enabled: true }]); const phrases = outputPhrases(words, m); expect(phrases[0].words[0].id).toBe('w2'); expect(phrases[0].start).toBeCloseTo(0); });
    it('supports one to eight words per card without inventing words', () => {
        for (let maxWords = 1; maxWords <= 8; maxWords++) {
            const phrases = outputPhrases(words, EditMap.fromCuts(5, []), 'clean', { maxWords });
            expect(phrases.every(p => p.words.length <= maxWords)).toBe(true);
            expect(phrases.flatMap(p => p.words).map(w => w.id)).toEqual(words.map(w => w.id));
        }
    });
    it('keeps text inside safe regions', () => { const c = { ...defaultCaptions, y: .99 }; expect(captionY(c, 100, 1920) + 50).toBeLessThanOrEqual(1920 * (1 - c.safe.bottom)); });
    it('empty input never generates invented captions', () => { expect(groupWords([])).toEqual([]); expect(normalizeChunks([], 3)).toEqual([]); });
});
