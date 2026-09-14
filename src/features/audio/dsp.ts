import type { AudioStats } from '../../types/project';
import { EditMap } from '../edit-map';

export const AUDIO_RATE = 48_000;
const db = (value: number) => 20 * Math.log10(Math.max(1e-9, value));

export function signalStats(data: Float32Array): AudioStats {
    let sum = 0;
    let peak = 0;
    for (const raw of data) {
        const value = Number.isFinite(raw) ? raw : 0;
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
    }
    return { rmsDb: db(Math.sqrt(sum / Math.max(1, data.length))), peakDb: db(peak), gainDb: 0, denoised: false };
}

/** Fill a block on the canonical output sample clock.
 * A 4 ms linear crossfade surrounds each internal cut without changing EDL
 * duration. Arbitrary block boundaries produce identical samples.
 */
export function audioBlock(source: Float32Array, map: EditMap, first: number, count: number, rate = AUDIO_RATE, gain = 1): Float32Array {
    const block = new Float32Array(count);
    const halfFade = Math.max(1, Math.round(.002 * rate));
    const sampleAt = (position: number) => {
        const index = Math.floor(position);
        const fraction = position - index;
        return (source[index] ?? 0) * (1 - fraction) + (source[index + 1] ?? 0) * fraction;
    };
    for (let index = 0; index < map.ranges.length; index++) {
        const range = map.ranges[index];
        const outputStart = Math.round(range.outputStart * rate);
        const outputEnd = Math.round(range.outputEnd * rate);
        const start = Math.max(first, outputStart);
        const end = Math.min(first + count, outputEnd);
        if (end <= start) continue;
        for (let sample = start; sample < end; sample++) {
            let value = sampleAt(range.sourceStart * rate + sample - outputStart) * gain;
            if (index === 0 && range.sourceStart > 0) value *= Math.min(1, (sample - outputStart) / (halfFade * 2));
            if (index === map.ranges.length - 1 && range.sourceEnd < map.sourceDuration) value *= Math.min(1, (outputEnd - 1 - sample) / (halfFade * 2));
            block[sample - first] = Math.max(-1, Math.min(1, value));
        }
    }
    for (let index = 1; index < map.ranges.length; index++) {
        const left = map.ranges[index - 1];
        const right = map.ranges[index];
        const seam = Math.round(right.outputStart * rate);
        const half = Math.min(halfFade, Math.floor((left.outputEnd - left.outputStart) * rate / 2), Math.floor((right.outputEnd - right.outputStart) * rate / 2));
        if (half < 1) continue;
        const start = Math.max(first, seam - half);
        const end = Math.min(first + count, seam + half);
        for (let sample = start; sample < end; sample++) {
            const relative = sample - seam;
            const mix = (relative + half + .5) / (half * 2);
            const value = (sampleAt(left.sourceEnd * rate + relative) * (1 - mix) + sampleAt(right.sourceStart * rate + relative) * mix) * gain;
            block[sample - first] = Math.max(-1, Math.min(1, value));
        }
    }
    return block;
}

export function makeWav(pcm: Float32Array, sampleRate = AUDIO_RATE): Blob {
    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const value = Math.max(-1, Math.min(1, Number.isFinite(pcm[i]) ? pcm[i] : 0)); view.setInt16(44 + i * 2, value < 0 ? value * 32_768 : value * 32_767, true); }
    return new Blob([buffer], { type: 'audio/wav' });
}
