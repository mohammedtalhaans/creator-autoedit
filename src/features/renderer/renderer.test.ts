import { describe, it, expect } from 'vitest';
import { layoutCaption, type Context } from './index';
import { defaultCaptions } from '../captions';
const context = () => ({ font: '', measureText(text: string) { const size = Number(this.font.match(/([0-9.]+)px/)?.[1] ?? 0); return { width: text.length * size * .6 }; } } as unknown as Context);
const phrase = (texts: string[]) => ({ id: 'p', start: 0, end: 3, words: texts.map((text, i) => ({ id: `w${i}`, text, start: i * .3, end: (i + 1) * .3 })) });
describe('shared deterministic caption layout', () => {
    it('wraps at word boundaries and stays inside the safe width', () => { const ctx = context(), l = layoutCaption(ctx, phrase(['Every', 'beautiful', 'word', 'matters']), defaultCaptions, 720); expect(l.lines.length).toBeLessThanOrEqual(2); expect(Math.max(...l.widths)).toBeLessThanOrEqual(l.right - l.left); });
    it('long corrected words never exceed the frame', () => { const l = layoutCaption(context(), phrase(['extra'.repeat(90)]), defaultCaptions, 720); expect(l.widths[0]).toBeLessThanOrEqual(l.right - l.left); });
    it('measurement and drawing retain the same font size', () => { const ctx = context(), l = layoutCaption(ctx, phrase(['extra'.repeat(90)]), defaultCaptions, 720); expect(Number(ctx.font.match(/([0-9.]+)px/)?.[1])).toBeCloseTo(l.size, 8); });
    it('respects short landscape safe-area height', () => { const c = { ...defaultCaptions, size: 1.6 }, l = layoutCaption(context(), phrase(['One', 'great', 'thought', 'today']), c, 1080, 608); expect(l.height).toBeLessThanOrEqual(608 * (1 - c.safe.top - c.safe.bottom) + .01); });
    it('uppercase changes text, not word timing', () => { const l = layoutCaption(context(), phrase(['their', 'idea']), { ...defaultCaptions, uppercase: true }, 720); expect(l.lines[0][0].text).toBe('THEIR'); expect(l.lines[0][0].start).toBe(0); expect(l.lines[0][1].id).toBe('w1'); });
    it('honours one-line and two-line budgets after wrapping', () => {
        const p = phrase(['One', 'two', 'three', 'four', 'five', 'six']);
        expect(layoutCaption(context(), p, { ...defaultCaptions, maxLines: 1, maxWords: 8 }, 720).lines).toHaveLength(1);
        expect(layoutCaption(context(), p, { ...defaultCaptions, maxLines: 2, maxWords: 8 }, 720).lines.length).toBeLessThanOrEqual(2);
    });
});
