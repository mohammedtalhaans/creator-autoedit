import type { Pause, CutPreset, CutDecision, WaveformData, Project, CutConfig } from '../../types/project';

const EPS = 1e-9;
const WINDOW_SECONDS = .02;
const db = (value: number) => 20 * Math.log10(Math.max(value, 1e-8));
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? -80;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

/**
 * Analyze only local PCM energy. This is an activity gate: it can see sound
 * and silence, but it cannot determine whether a sound is speech.
 */
export function analyzeSignal(pcm: Float32Array, sampleRate: number, buckets = 650): { waveform: WaveformData; pauses: Pause[] } {
    if (!(sampleRate > 0))
        throw new Error('Invalid sample rate');
    const window = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS));
    const energy: number[] = [];
    for (let start = 0; start < pcm.length; start += window) {
        const end = Math.min(start + window, pcm.length);
        let sum = 0;
        for (let i = start; i < end; i++) {
            const sample = Number.isFinite(pcm[i]) ? pcm[i] : 0;
            sum += sample * sample;
        }
        energy.push(db(Math.sqrt(sum / Math.max(1, end - start))));
    }
    const sorted = [...energy].sort((a, b) => a - b);
    const floor = quantile(sorted, .18);
    const activity = quantile(sorted, .85);
    // Keep the threshold conservative around a rising consonant or plosive.
    // A gate transition is evidence of activity, never evidence of speech.
    const threshold = Math.min(-26, Math.max(-68, Math.min(floor + 8, activity - 15)));
    const duration = pcm.length / sampleRate;
    const pauses: Pause[] = [];
    if (activity > -65 && activity - floor > 8) {
        let silent = false;
        let start = 0;
        for (let i = 0; i <= energy.length; i++) {
            const level = energy[i] ?? 0;
            if (!silent && level < threshold) {
                silent = true;
                start = i * WINDOW_SECONDS;
            }
            if (silent && (level > threshold + 3 || i === energy.length)) {
                const end = Math.min(duration, i * WINDOW_SECONDS);
                // A pair of 20 ms windows is the shortest candidate. Presets
                // apply their own minimum before making an EDL decision.
                if (end - start >= .04)
                    pauses.push({ id: `pause-${Math.round(start * 1000)}`, start, end, confidence: Math.min(1, Math.max(.2, (activity - floor) / 35)) });
                silent = false;
            }
        }
    }
    const count = Math.min(Math.max(1, buckets), Math.max(1, pcm.length));
    const peaks: number[] = [];
    const rms: number[] = [];
    for (let i = 0; i < count; i++) {
        const a = Math.floor(i * pcm.length / count);
        const b = Math.floor((i + 1) * pcm.length / count);
        let peak = 0;
        let sum = 0;
        for (let j = a; j < b; j++) {
            const value = Number.isFinite(pcm[j]) ? pcm[j] : 0;
            peak = Math.max(peak, Math.abs(value));
            sum += value * value;
        }
        peaks.push(peak);
        rms.push(Math.sqrt(sum / Math.max(1, b - a)));
    }
    return { waveform: { peaks, rms, duration, windowMs: WINDOW_SECONDS * 1000, noiseFloorDb: floor, activityDb: activity }, pauses };
}

export type CutAdjustment = { startDelta: number; endDelta: number };
export type DecisionOptions = {
    minPause?: number;
    /** Legacy symmetric padding; used only when an asymmetric handle is absent. */
    padding?: number;
    afterSpeechPadding?: number;
    beforeSpeechPadding?: number;
    duration?: number;
    cutAdjustments?: Record<string, CutAdjustment>;
};

export type CutHandles = { afterSpeechPadding: number; beforeSpeechPadding: number };
const presetHandles: Record<CutPreset, CutHandles> = {
    natural: { afterSpeechPadding: .12, beforeSpeechPadding: .18 },
    tight: { afterSpeechPadding: .04, beforeSpeechPadding: .12 },
    jump: { afterSpeechPadding: .01, beforeSpeechPadding: .09 },
    off: { afterSpeechPadding: 0, beforeSpeechPadding: 0 }
};
export function defaultCutHandles(preset: CutPreset): CutHandles { return { ...presetHandles[preset] }; }

/** Migrate old symmetric projects without changing their saved EDL intent. */
export function resolveCutHandles(config: Partial<CutConfig> | undefined, preset: CutPreset): CutHandles {
    const defaults = defaultCutHandles(preset);
    const legacy = Number.isFinite(config?.padding) ? clamp(config!.padding!, 0, .6) : undefined;
    return {
        afterSpeechPadding: clamp(config?.afterSpeechPadding ?? legacy ?? defaults.afterSpeechPadding, 0, .6),
        beforeSpeechPadding: clamp(config?.beforeSpeechPadding ?? legacy ?? defaults.beforeSpeechPadding, 0, .6)
    };
}

/** Old persisted `speech` detector values now resolve to the same audio gate. */
export function normalizeCutDetector(detector: unknown): 'audio' | 'energy' {
    return detector === 'energy' ? 'energy' : 'audio';
}

export function decisionsFor(pauses: Pause[], preset: CutPreset, _sensitivity = .5, overrides: Record<string, boolean> = {}, options: DecisionOptions = {}): CutDecision[] {
    const handles = resolveCutHandles(options, preset);
    const minimum = clamp(options.minPause ?? (preset === 'jump' ? .1 : preset === 'tight' ? .22 : .5), .04, 2);
    const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration!) : Infinity;
    const result: CutDecision[] = [];
    for (const pause of pauses) {
        const sourceStart = clamp(pause.start, 0, duration);
        const sourceEnd = clamp(pause.end, 0, duration);
        if (!(sourceEnd > sourceStart) || sourceEnd - sourceStart < minimum)
            continue;
        // A synthetic all-silent marker must never produce an empty EDL.
        const allSilent = pause.id === 'pause-all-silent' || (sourceStart <= .0001 && Number.isFinite(duration) && sourceEnd >= duration - .0001);
        if (allSilent)
            continue;
        let start = sourceStart + handles.afterSpeechPadding;
        let end = sourceEnd - handles.beforeSpeechPadding;
        // The first detected gate transition is the least certain boundary.
        // Keep a 150 ms lead-in so a low-energy fricative/plosive cannot be
        // removed from the start of a take. This also makes short leading
        // candidates disappear instead of fabricating a cut.
        if (sourceStart <= EPS)
            start = Math.max(start, Math.min(sourceEnd, .15));
        const adjustment = options.cutAdjustments?.[pause.id];
        if (adjustment) {
            // startDelta > 0 and endDelta < 0 both mean “keep more”. Values
            // are clamped to this pause so cards cannot invert their ranges.
            start += Number.isFinite(adjustment.startDelta) ? adjustment.startDelta : 0;
            end += Number.isFinite(adjustment.endDelta) ? adjustment.endDelta : 0;
        }
        start = clamp(start, sourceStart, sourceEnd);
        end = clamp(end, sourceStart, sourceEnd);
        if (end <= start + .001) {
            result.push({ id: pause.id, start, end: start, enabled: false });
            continue;
        }
        result.push({ id: pause.id, start, end, enabled: preset !== 'off' && (overrides[pause.id] ?? true) });
    }
    return result;
}

/** Single source of truth for preview and export EDL consumers. */
export function projectCuts(project: Project): CutDecision[] {
    const config = project.cutConfig;
    const detector = normalizeCutDetector(config?.detector);
    // Both detector labels use the same deterministic gate. `energy` remains
    // accepted for old projects and tests; no semantic classifier is invoked.
    const pauses = detector === 'audio' || detector === 'energy' ? project.pauses ?? [] : [];
    return decisionsFor(pauses, project.cutPreset, project.sensitivity ?? .5, project.overrides ?? {}, {
        minPause: config?.minPause,
        padding: config?.padding,
        afterSpeechPadding: config?.afterSpeechPadding,
        beforeSpeechPadding: config?.beforeSpeechPadding,
        duration: project.metadata.duration,
        cutAdjustments: project.cutAdjustments
    });
}
