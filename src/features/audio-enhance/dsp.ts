import type { AudioStats } from '../../types/project';
import { EditMap } from '../edit-map';
export const AUDIO_RATE = 48000;
const db = (v: number) => 20 * Math.log10(Math.max(1e-9, v));
export function signalStats(data: Float32Array): AudioStats {
    let sum = 0, peak = 0;
    for (const raw of data) {
        const v = Number.isFinite(raw) ? raw : 0;
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
    }
    return { rmsDb: db(Math.sqrt(sum / Math.max(1, data.length))), peakDb: db(peak), gainDb: 0, denoised: false };
}
/** Windowed-sinc resampling. 24 taps; no alias-prone nearest-neighbor downsampling. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
    if (!(from > 0 && to > 0))
        throw new Error('Invalid audio sample rate');
    if (from === to)
        return input.slice();
    const result = new Float32Array(Math.round(input.length * to / from));
    const cutoff = Math.min(1, to / from) * .94, half = 12;
    for (let i = 0; i < result.length; i++) {
        const at = i * from / to, center = Math.floor(at);
        let sum = 0, weight = 0;
        for (let j = center - half + 1; j <= center + half; j++) {
            const d = at - j;
            if (Math.abs(d) >= half)
                continue;
            const sinc = Math.abs(d) < 1e-8 ? cutoff : Math.sin(Math.PI * d * cutoff) / (Math.PI * d);
            const w = sinc * (.5 + .5 * Math.cos(Math.PI * d / half));
            sum += (input[Math.max(0, Math.min(input.length - 1, j))] ?? 0) * w;
            weight += w;
        }
        result[i] = weight ? sum / weight : 0;
    }
    return result;
}
/** Conservative mono voice chain: high-pass, presence, soft-knee envelope compression,
 * level normalization (bounded makeup) and a final -1 dB sample peak ceiling. */
export function enhanceVoice(input: Float32Array, rate = AUDIO_RATE): {
    pcm: Float32Array;
    stats: AudioStats;
} {
    const pcm = input.slice(), r = Math.exp(-2 * Math.PI * 75 / rate), attack = Math.exp(-1 / (.006 * rate)), release = Math.exp(-1 / (.14 * rate));
    let prevIn = 0, prevOut = 0, lp = 0, envelope = 0;
    const lpA = 1 - Math.exp(-2 * Math.PI * 1800 / rate);
    for (let i = 0; i < pcm.length; i++) {
        const v = Number.isFinite(pcm[i]) ? pcm[i] : 0, high = r * (prevOut + v - prevIn);
        prevIn = v;
        prevOut = high;
        lp += lpA * (high - lp);
        const shaped = high + .07 * (high - lp), abs = Math.abs(shaped), coeff = abs > envelope ? attack : release;
        envelope = coeff * envelope + (1 - coeff) * abs;
        const level = db(envelope), over = level + 19;
        const knee = 6, compressed = over <= -knee / 2 ? 0 : over >= knee / 2 ? over * (1 - 1 / 2.1) : (over + knee / 2) ** 2 / (2 * knee) * (1 - 1 / 2.1);
        pcm[i] = shaped * Math.pow(10, -compressed / 20);
    }
    const before = signalStats(pcm);
    const gainDb = before.rmsDb < -65 ? 0 : Math.max(-6, Math.min(8, -19 - before.rmsDb));
    const gain = Math.pow(10, gainDb / 20), ceiling = Math.pow(10, -1 / 20);
    for (let i = 0; i < pcm.length; i++) {
        const x = pcm[i] * gain;
        pcm[i] = Math.max(-ceiling, Math.min(ceiling, x));
    }
    return { pcm, stats: { ...signalStats(pcm), gainDb } };
}
/** Fill a block on the canonical output sample clock.
 * A 4 ms linear crossfade surrounds each internal cut without changing EDL duration.
 * Both sides borrow only the neighboring source handles; automatic cuts leave speech padding.
 * Start/end trims use short ramps. Arbitrary block boundaries produce identical samples.
 */
export function audioBlock(source: Float32Array, map: EditMap, first: number, count: number, rate = AUDIO_RATE, gain = 1): Float32Array {
    const block = new Float32Array(count), halfFade = Math.max(1, Math.round(.002 * rate));
    const sampleAt = (pos: number) => { const i = Math.floor(pos), f = pos - i; return (source[i] ?? 0) * (1 - f) + (source[i + 1] ?? 0) * f; };
    for (let r = 0; r < map.ranges.length; r++) {
        const range = map.ranges[r], outStart = Math.round(range.outputStart * rate), outEnd = Math.round(range.outputEnd * rate);
        const a = Math.max(first, outStart), b = Math.min(first + count, outEnd);
        if (b <= a)
            continue;
        for (let n = a; n < b; n++) {
            let value = sampleAt(range.sourceStart * rate + (n - outStart)) * gain;
            if (r === 0 && range.sourceStart > 0)
                value *= Math.min(1, (n - outStart) / (halfFade * 2));
            if (r === map.ranges.length - 1 && range.sourceEnd < map.sourceDuration)
                value *= Math.min(1, (outEnd - 1 - n) / (halfFade * 2));
            block[n - first] = Math.max(-1, Math.min(1, value));
        }
    }
    for (let r = 1; r < map.ranges.length; r++) {
        const left = map.ranges[r - 1], right = map.ranges[r], seam = Math.round(right.outputStart * rate);
        const half = Math.min(halfFade, Math.floor((left.outputEnd - left.outputStart) * rate / 2), Math.floor((right.outputEnd - right.outputStart) * rate / 2));
        if (half < 1)
            continue;
        const a = Math.max(first, seam - half), b = Math.min(first + count, seam + half);
        for (let n = a; n < b; n++) {
            const relative = n - seam, mix = (relative + half + .5) / (half * 2);
            const value = (sampleAt(left.sourceEnd * rate + relative) * (1 - mix) + sampleAt(right.sourceStart * rate + relative) * mix) * gain;
            block[n - first] = Math.max(-1, Math.min(1, value));
        }
    }
    return block;
}
export function makeWav(pcm: Float32Array, sampleRate = AUDIO_RATE): Blob {
    const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
    const str = (at: number, s: string) => {
        for (let i = 0; i < s.length; i++)
            v.setUint8(at + i, s.charCodeAt(i));
    };
    str(0, 'RIFF');
    v.setUint32(4, 36 + pcm.length * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
        const x = Math.min(1, Math.max(-1, pcm[i]));
        v.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true);
    }
    return new Blob([b], { type: 'audio/wav' });
}
