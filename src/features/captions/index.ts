import type { TranscriptWord, Phrase, CaptionConfig, CaptionPreset } from '../../types/project';
import { EditMap } from '../edit-map';
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/**
 * Caption defaults are intentionally kept in one place. Projects created before the
 * social style controls were added can be passed through normalizeCaptionConfig at
 * every render boundary without changing their serialized shape.
 */
export const defaultCaptions: CaptionConfig = {
    enabled: true,
    preset: 'clean',
    animation: 'word',
    font: 'studio',
    size: 1,
    y: .71,
    align: 'center',
    color: '#fff8e8',
    accent: '#ffffff',
    background: false,
    opacity: .7,
    shadow: true,
    highlight: true,
    uppercase: false,
    maxWords: 3,
    maxLines: 2,
    outlineWidth: 2,
    outlineColor: '#101010',
    fontWeight: 800,
    letterSpacing: 0,
    backgroundColor: '#08090a',
    cornerRadius: 8,
    lineGap: .12,
    italic: false,
    safe: { top: .10, bottom: .20, right: .13, left: .07 },
};
export const captionPresets: Record<CaptionPreset, Partial<CaptionConfig>> = {
    clean: { font: 'studio', size: 1, uppercase: false, background: false, shadow: true, highlight: true, animation: 'word' },
    punch: { font: 'condensed', size: 1.30, uppercase: true, background: false, shadow: true, highlight: true, animation: 'pop' },
    editorial: { font: 'studio', size: .90, uppercase: false, background: true, opacity: .65, shadow: false, highlight: false, animation: 'smooth' },
    subtitle: { font: 'studio', size: .70, uppercase: false, background: false, shadow: true, highlight: false, animation: 'smooth' },
    creator: { font: 'studio', size: 1.12, uppercase: false, background: true, opacity: .85, shadow: false, highlight: true, animation: 'pop' },
    'bold-outline': { font: 'condensed', size: 1.12, uppercase: true, background: false, shadow: true, highlight: false, animation: 'pop', outlineWidth: 3, outlineColor: '#08090a', fontWeight: 900, letterSpacing: .4 },
    karaoke: { font: 'studio', size: 1.04, uppercase: false, background: true, backgroundColor: '#10160f', opacity: .82, shadow: false, highlight: true, animation: 'word', outlineWidth: 1 },
    'one-word': { font: 'condensed', size: 1.28, maxWords: 1, maxLines: 1, uppercase: true, background: false, shadow: true, highlight: true, animation: 'pop', outlineWidth: 3, outlineColor: '#08090a', fontWeight: 900 },
    minimal: { font: 'studio', size: .78, maxWords: 4, maxLines: 2, uppercase: false, background: false, shadow: false, highlight: false, animation: 'smooth', outlineWidth: 0, fontWeight: 600, letterSpacing: .1 },
    neon: { font: 'condensed', size: 1.14, uppercase: true, background: true, backgroundColor: '#15102a', opacity: .72, shadow: true, highlight: true, animation: 'pop', outlineWidth: 2, outlineColor: '#24113d', fontWeight: 850, letterSpacing: .6 },
};
export const captionPresetLabels: Record<CaptionPreset, string> = {
    clean: 'Clean word highlight',
    punch: 'Punchy condensed type',
    editorial: 'Editorial caption plate',
    subtitle: 'Minimal subtitle',
    creator: 'Creator highlight plate',
    'bold-outline': 'Bold outlined social type',
    karaoke: 'Karaoke active word',
    'one-word': 'One word at a time',
    minimal: 'Quiet minimal subtitle',
    neon: 'Neon accent plate',
};
/** Fill defaults for old projects while clamping values received from user edits. */
export function normalizeCaptionConfig(config: Partial<CaptionConfig> = {}): CaptionConfig {
    const safe = { ...defaultCaptions.safe, ...(config.safe ?? {}) };
    return {
        ...defaultCaptions,
        ...config,
        maxWords: clamp(Math.round(config.maxWords ?? defaultCaptions.maxWords!), 1, 8),
        maxLines: clamp(Math.round(config.maxLines ?? defaultCaptions.maxLines!), 1, 2),
        outlineWidth: clamp(config.outlineWidth ?? defaultCaptions.outlineWidth!, 0, 12),
        outlineColor: config.outlineColor ?? defaultCaptions.outlineColor,
        fontWeight: clamp(Math.round(config.fontWeight ?? defaultCaptions.fontWeight!), 400, 900),
        letterSpacing: clamp(config.letterSpacing ?? defaultCaptions.letterSpacing!, 0, 8),
        backgroundColor: config.backgroundColor ?? defaultCaptions.backgroundColor,
        cornerRadius: clamp(config.cornerRadius ?? defaultCaptions.cornerRadius!, 0, 48),
        lineGap: clamp(config.lineGap ?? defaultCaptions.lineGap!, 0, 1),
        italic: config.italic ?? defaultCaptions.italic,
        safe,
    };
}
export function groupWords(words: TranscriptWord[], maxWords = 3, maxChars = 29): Phrase[] {
    maxWords = clamp(Math.round(maxWords), 1, 8);
    maxChars = Math.max(1, maxChars);
    const sorted = words.filter(w => w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start).sort((a, b) => a.start - b.start);
    const phrases: Phrase[] = [];
    let current: TranscriptWord[] = [];
    const flush = () => {
        if (current.length) {
            phrases.push({ id: current[0].id, start: current[0].start, end: current.at(-1)!.end, words: current });
            current = [];
        }
    };
    for (const word of sorted) {
        const prev = current.at(-1);
        const chars = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
        if (prev && (current.length >= maxWords || word.start - prev.end > .35 || chars > maxChars || /[.!?;:]$/.test(prev.text)))
            flush();
        current.push(word);
    }
    flush();
    return phrases;
}
/** Group in OUTPUT time. The source timestamps remain untouched in project state. */
export function outputPhrases(words: TranscriptWord[], map: EditMap, style: CaptionPreset = 'clean', config?: Partial<CaptionConfig>): Phrase[] {
    const normalized = normalizeCaptionConfig({ ...config, preset: style });
    return groupWords(words.map(w => map.remapWord(w)).filter((w): w is TranscriptWord => w !== null), normalized.maxWords ?? 3, 29);
}
export function activePhrase(phrases: Phrase[], time: number): Phrase | undefined {
    let lo = 0, hi = phrases.length - 1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1, p = phrases[m];
        if (time < p.start)
            hi = m - 1;
        else if (time >= p.end)
            lo = m + 1;
        else
            return p;
    }
    return undefined;
}
export function correctPhrase(words: TranscriptWord[], ids: string[], text: string): TranscriptWord[] {
    const selected = words.filter(w => ids.includes(w.id));
    if (!selected.length)
        return words;
    const parts = text.trim().split(/\s+/).filter(Boolean), start = selected[0].start, end = selected.at(-1)!.end;
    let replacement: TranscriptWord[];
    if (parts.length === selected.length)
        replacement = selected.map((w, i) => ({ ...w, text: parts[i] }));
    else {
        const lengths = parts.map(p => Math.max(1, p.length)), total = lengths.reduce((a, b) => a + b, 0);
        let at = start;
        replacement = parts.map((p, i) => { const until = i === parts.length - 1 ? end : at + (end - start) * lengths[i] / total; const w = { id: `${selected[0].id}-edit-${i}`, text: p, start: at, end: until }; at = until; return w; });
    }
    const first = words.findIndex(w => w.id === selected[0].id);
    return [...words.slice(0, first), ...replacement, ...words.slice(first).filter(w => !ids.includes(w.id))];
}
export function normalizeChunks(chunks: {
    text: string;
    timestamp: [
        number | null,
        number | null
    ];
}[], duration: number, offset = 0): TranscriptWord[] {
    const result: TranscriptWord[] = [];
    for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const start = Math.max(0, c.timestamp[0] ?? (i ? chunks[i - 1].timestamp[1] ?? 0 : 0));
        const end = Math.min(duration, Math.max(start + .02, c.timestamp[1] ?? chunks[i + 1]?.timestamp[0] ?? duration));
        const text = c.text.trim();
        if (!text || start >= duration)
            continue;
        const split = text.split(/\s+/);
        split.forEach((s, j) => result.push({ id: `word-${Math.round((offset + start) * 1000)}-${i}-${j}`, text: s, start: offset + start + (end - start) * j / split.length, end: offset + start + (end - start) * (j + 1) / split.length }));
    }
    return result;
}
export function captionY(config: CaptionConfig, blockHeight: number, height: number): number {
    const min = config.safe.top * height + blockHeight / 2, max = (1 - config.safe.bottom) * height - blockHeight / 2;
    return Math.max(min, Math.min(max, config.y * height));
}
