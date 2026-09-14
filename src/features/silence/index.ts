import type { Pause, CutPreset, CutDecision, WaveformData, Project, CutConfig, TranscriptWord, SpeechSegment } from '../../types/project';
export type { SpeechSegment } from '../../types/project';
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-8));
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? -80;
export function analyzeSignal(pcm: Float32Array, sampleRate: number, buckets = 650): {
    waveform: WaveformData;
    pauses: Pause[];
} {
    if (!(sampleRate > 0))
        throw new Error('Invalid sample rate');
    const window = Math.max(1, Math.round(sampleRate * .02));
    const energy: number[] = [];
    for (let s = 0; s < pcm.length; s += window) {
        let sum = 0;
        const end = Math.min(s + window, pcm.length);
        for (let i = s; i < end; i++)
            sum += (Number.isFinite(pcm[i]) ? pcm[i] : 0) ** 2;
        energy.push(db(Math.sqrt(sum / Math.max(1, end - s))));
    }
    const sorted = [...energy].sort((a, b) => a - b), floor = quantile(sorted, .18), speech = quantile(sorted, .85);
    // Dynamic contrast protects quiet speech. The ceiling avoids labeling room tone as speech.
    const threshold = Math.min(-26, Math.max(-68, Math.min(floor + 8, speech - 15)));
    const duration = pcm.length / sampleRate;
    const pauses: Pause[] = [];
    if (speech > -65 && speech - floor > 8) {
        let silent = false, start = 0;
        for (let i = 0; i <= energy.length; i++) {
            const level = energy[i] ?? 0;
            if (!silent && level < threshold) {
                silent = true;
                start = i * .02;
            }
            if (silent && (level > threshold + 3 || i === energy.length)) {
                const end = Math.min(duration, i * .02);
                // Keep two 20 ms energy windows visible. Natural and Tight
                // presets still filter these short gaps through their minimum.
                if (end - start >= .04)
                    pauses.push({ id: `pause-${Math.round(start * 1000)}`, start, end, confidence: Math.min(1, Math.max(.2, (speech - floor) / 35)) });
                silent = false;
            }
        }
    }
    const count = Math.min(buckets, Math.max(1, pcm.length));
    const peaks: number[] = [], rms: number[] = [];
    for (let i = 0; i < count; i++) {
        const a = Math.floor(i * pcm.length / count), b = Math.floor((i + 1) * pcm.length / count);
        let peak = 0, sum = 0;
        for (let j = a; j < b; j++) {
            const v = Number.isFinite(pcm[j]) ? pcm[j] : 0;
            peak = Math.max(peak, Math.abs(v));
            sum += v * v;
        }
        peaks.push(peak);
        rms.push(Math.sqrt(sum / Math.max(1, b - a)));
    }
    return { waveform: { peaks, rms, duration, windowMs: 20, noiseFloorDb: floor, speechDb: speech }, pauses };
}
export type DecisionOptions = {
    /** Explicit values come from the live cut controls. */
    minPause?: number;
    padding?: number;
    /** Source duration lets us guard all-silent clips from an empty EDL. */
    duration?: number;
    /** Timestamped ASR words are never removed by an automatic decision. */
    protectWords?: TranscriptWord[];
    /** Restrict ASR protection to words supported by credible VAD speech. */
    speechSegments?: SpeechSegment[];
};
const clampDuration = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
function subtractProtectedWords(start: number, end: number, words: TranscriptWord[]): [number, number][] {
    let ranges: [number, number][] = [[start, end]];
    for (const word of words) {
        if (!(word.end > word.start)) continue;
        const ws = Math.max(start, word.start), we = Math.min(end, word.end);
        if (we <= ws) continue;
        const next: [number, number][] = [];
        for (const [a, b] of ranges) {
            if (we <= a || ws >= b) next.push([a, b]);
            else {
                if (ws - a > .001) next.push([a, ws]);
                if (b - we > .001) next.push([we, b]);
            }
        }
        ranges = next;
        if (!ranges.length) break;
    }
    return ranges;
}
function boundedSpeechWords(words: TranscriptWord[], segments: SpeechSegment[], guard = .02): TranscriptWord[] {
    const result: TranscriptWord[] = [];
    for (const word of words) {
        if (!(word.end > word.start)) continue;
        for (const segment of segments) {
            const start = Math.max(word.start, segment.start), end = Math.min(word.end, segment.end);
            if (end <= start) continue;
            // Only the credible VAD overlap plus a very small boundary guard is
            // protected. A hallucinated multi-second ASR timestamp cannot make
            // the surrounding noise/music region look like speech.
            result.push({ ...word, start: Math.max(segment.start - guard, start - guard), end: Math.min(segment.end + guard, end + guard) });
        }
    }
    return result;
}
export function decisionsFor(pauses: Pause[], preset: CutPreset, sensitivity = .5, overrides: Record<string, boolean> = {}, options: DecisionOptions = {}): CutDecision[] {
    const pad = clampDuration(options.padding ?? (preset === 'jump' ? .01 : preset === 'tight' ? .11 : .19), 0, .4);
    const minimum = clampDuration(options.minPause ?? ((preset === 'jump' ? .064 : preset === 'tight' ? .44 : .7) + (preset === 'jump' ? 0 : (.5 - sensitivity) * .35)), .04, 2);
    const words = options.speechSegments
        ? boundedSpeechWords(options.protectWords ?? [], options.speechSegments)
        : (options.protectWords ?? []).filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);
    const duration = Number.isFinite(options.duration) ? options.duration! : Infinity;
    const result: CutDecision[] = [];
    for (const pause of pauses) {
        const sourceStart = Math.max(0, pause.start), sourceEnd = Math.min(duration, pause.end);
        if (sourceEnd - sourceStart < minimum) continue;
        const start = sourceStart === 0 ? 0 : sourceStart + pad;
        const end = Math.max(start, sourceEnd - pad);
        if (end - start <= .001) continue;
        const protectedRanges = subtractProtectedWords(start, end, words);
        // An all-silent clip gets an explicit keep decision, so the editor can
        // explain the result and the EDL can never become an empty video.
        const allSilent = pause.id === 'pause-all-silent' || (sourceStart <= .0001 && Number.isFinite(duration) && sourceEnd >= duration - .0001);
        if (!protectedRanges.length) {
            result.push({ id: pause.id, start, end, enabled: false });
            continue;
        }
        protectedRanges.forEach((range, i) => result.push({
            id: protectedRanges.length === 1 ? pause.id : `${pause.id}-${i + 1}`,
            start: range[0],
            end: range[1],
            enabled: !allSilent && preset !== 'off' && (overrides[pause.id] ?? overrides[`${pause.id}-${i + 1}`] ?? true),
        }));
    }
    return result;
}

/**
 * Turn Silero speech intervals into the complement pauses used by the EDL.
 * Leading and trailing gaps are intentional: a take may begin or end with dead
 * air. Intervals are merged before complementing to avoid micro-cuts at VAD
 * hysteresis boundaries.
 */
export function pausesFromSpeechSegments(segments: SpeechSegment[], duration: number, _legacyWords?: TranscriptWord[]): Pause[] {
    const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
    const protectedSegments = segments.map(s => ({ start: Math.max(0, Math.min(safeDuration, s.start)), end: Math.max(0, Math.min(safeDuration, s.end)), confidence: s.confidence ?? .8 }))
        .filter(s => s.end > s.start)
        .sort((a, b) => a.start - b.start);
    const merged: SpeechSegment[] = [];
    for (const segment of protectedSegments) {
        const last = merged.at(-1);
        if (last && segment.start <= last.end) {
            last.end = Math.max(last.end, segment.end);
            last.confidence = Math.max(last.confidence ?? 0, segment.confidence ?? 0);
        }
        else merged.push({ ...segment });
    }
    if (!merged.length)
        return safeDuration > 0 ? [{ id: 'pause-all-silent', start: 0, end: safeDuration, confidence: 1 }] : [];
    const pauses: Pause[] = [];
    let at = 0;
    const add = (start: number, end: number, confidence: number) => {
        if (end - start < .02) return;
        pauses.push({ id: `speech-pause-${Math.round(start * 1000)}`, start, end, confidence: Math.max(.2, Math.min(1, confidence)) });
    };
    for (const speech of merged) {
        add(at, speech.start, 1 - (speech.confidence ?? .8) * .25);
        at = Math.max(at, speech.end);
    }
    add(at, safeDuration, 1);
    return pauses;
}

/** Convert frame-level Silero probabilities into speech spans without adding
 * an artificial edge pad. EDL padding is the only place that trims/retains
 * handles, so a real 64 ms quiet gap remains visible to Jump cut. */
export function speechSegmentsFromProbabilities(probabilities: number[], duration: number, options: {
    sampleRate?: number;
    frameSize?: number;
    threshold?: number;
    exitThreshold?: number;
    minSilenceFrames?: number;
    minSpeechFrames?: number;
    strongThreshold?: number;
} = {}): SpeechSegment[] {
    const rate = options.sampleRate ?? 16_000;
    const frameSize = options.frameSize ?? 512;
    const threshold = options.threshold ?? .50;
    const exitThreshold = options.exitThreshold ?? .35;
    const minSilenceFrames = Math.max(1, Math.round(options.minSilenceFrames ?? 2));
    const minSpeechFrames = Math.max(1, Math.round(options.minSpeechFrames ?? 3));
    const strongThreshold = options.strongThreshold ?? .85;
    const frameSeconds = frameSize / rate;
    const segments: SpeechSegment[] = [];
    let inSpeech = false, speechStart = 0, silentFrames = 0, speechFrames = 0, scoreSum = 0, scorePeak = 0;
    const close = (end: number) => {
        const span = Math.min(duration, Math.max(speechStart, end)) - speechStart;
        const credible = speechFrames >= minSpeechFrames || (speechFrames >= 2 && scorePeak >= strongThreshold);
        if (inSpeech && credible && span > 0)
            segments.push({ start: speechStart, end: Math.min(duration, Math.max(speechStart, end)), confidence: Math.max(.2, Math.min(1, (scoreSum / Math.max(1, speechFrames) - exitThreshold) / (1 - exitThreshold))) });
        inSpeech = false;
        silentFrames = 0;
        speechFrames = 0;
        scoreSum = 0;
        scorePeak = 0;
    };
    for (let i = 0; i < probabilities.length; i++) {
        const score = Number.isFinite(probabilities[i]) ? probabilities[i] : 0;
        const frameStart = i * frameSeconds;
        const frameEnd = Math.min(duration, (i + 1) * frameSeconds);
        const active = score > threshold || (inSpeech && score >= exitThreshold);
        if (active) {
            if (!inSpeech) speechStart = Math.max(0, frameStart);
            inSpeech = true;
            silentFrames = 0;
            speechFrames++;
            scoreSum += score;
            scorePeak = Math.max(scorePeak, score);
        }
        else if (inSpeech) {
            silentFrames++;
            if (silentFrames >= minSilenceFrames)
                close(Math.max(speechStart, frameEnd - silentFrames * frameSeconds));
        }
    }
    if (inSpeech)
        close(Math.min(duration, probabilities.length * frameSeconds));
    return segments;
}

/** Single source of truth for every EDL consumer in the application. */
export function projectCuts(project: Project): CutDecision[] {
    const defaults: CutConfig = project.cutPreset === 'jump' || project.cutPreset === 'tight' ? { detector: 'speech', minPause: .064, padding: .01 } : { detector: 'energy', minPause: .7, padding: .19 };
    const config: CutConfig = { ...defaults, ...(project.cutConfig ?? {}) };
    // A completed speech pass is authoritative even when it found no spoken
    // regions. Falling back on `length` would silently resurrect energy cuts for
    // an all-silent clip or a model result that intentionally returned `[]`.
    const speechReady = project.speechStatus?.status === 'ready';
    const pauses = config.detector === 'speech' ? (speechReady ? (project.speechPauses ?? []) : []) : project.pauses;
    return decisionsFor(pauses, project.cutPreset, project.sensitivity, project.overrides, {
        minPause: config.minPause,
        padding: config.padding,
        duration: project.metadata.duration,
        protectWords: project.words,
        speechSegments: config.detector === 'speech' && speechReady ? (project.speechSegments ?? []) : undefined,
    });
}
