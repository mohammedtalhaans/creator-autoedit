import { describe, it, expect } from 'vitest';
import { AudioTimeline } from './audio-timeline';
function signal(length: number, rate: number) {
    return Float32Array.from({length}, (_, i) => .18 * Math.sin(i * 2 * Math.PI * 731 / rate) + .02 * Math.cos(i * 2 * Math.PI * 71 / rate));
}
function assembled(data: Float32Array, rate: number, chunk: number, offset = 0) {
    const timeline = new AudioTimeline(data.length / rate + Math.max(0, offset), 48000);
    for(let i = 0; i < data.length; i += chunk) timeline.push(data.subarray(i, i + chunk), offset + i / rate, rate);
    return timeline.finish();
}
function maxDifference(a: Float32Array, b: Float32Array) {
    let max = 0; for(let i=0;i<a.length;i++) max = Math.max(max, Math.abs(a[i] - b[i])); return max;
}
describe('timestamped streaming audio resampling', () => {
    for (const rate of [16000, 22050, 44100, 48000, 96000]) {
        for (const chunk of [127, 480, 1024]) {
            it(`${rate} Hz is packetization-independent with ${chunk}-frame packets`, () => {
                const data = signal(Math.round(rate * .13), rate), expected = assembled(data, rate, data.length);
                const actual = assembled(data, rate, chunk);
                expect(actual.length).toBe(expected.length);
                expect(maxDifference(actual, expected)).toBeLessThanOrEqual(.000001);
            });
        }
    }
    it('copies aligned 48 kHz samples without colouring them', () => {
        const data = signal(4800, 48000); expect(maxDifference(data, assembled(data, 48000, 128))).toBe(0);
    });
    it('negative priming timestamps are trimmed rather than delaying speech', () => {
        const t = new AudioTimeline(.1); const data = Float32Array.from({length: 960}, (_,i)=>i / 960);
        t.push(data, -.01, 48000); const out = t.finish(); expect(out[0]).toBe(data[480]); expect(out[479]).toBe(data[959]); expect(out[480]).toBe(0);
    });
    it('a delayed audio track has real silence before it starts', () => {
        const t = new AudioTimeline(.1); t.push(new Float32Array(480).fill(.2), .025, 48000);
        const out=t.finish(); expect(out[1199]).toBe(0); expect(out[1200]).toBeCloseTo(.2,6);
    });
    it('preserves timestamp gaps instead of concatenating them away', () => {
        const t = new AudioTimeline(.1); t.push(new Float32Array(480).fill(.2), 0, 48000); t.push(new Float32Array(480).fill(.3), .05, 48000);
        const out=t.finish(); expect(out[479]).toBeCloseTo(.2,6); expect(out[480]).toBe(0); expect(out[2399]).toBe(0); expect(out[2400]).toBeCloseTo(.3,6);
    });
    it('codec microsecond timestamp quantization does not accumulate drift', () => {
        const rate=44100, data=signal(rate,rate), t=new AudioTimeline(1);
        for(let i=0;i<data.length;i+=1024)t.push(data.subarray(i,i+1024),Math.round(i/rate*1e6)/1e6,rate);
        expect(maxDifference(t.finish(),assembled(data,rate,data.length))).toBeLessThanOrEqual(.000001);
    });
    it('non-finite decoded values never enter the output', () => {
        const t = new AudioTimeline(.01);t.push(new Float32Array([NaN,Infinity,-Infinity]),0,48000);
        expect(t.finish().every(Number.isFinite)).toBe(true);
    });
    it('rejects invalid durations and sample rates without allocating huge buffers', () => {
        expect(()=>new AudioTimeline(Infinity)).toThrow();expect(()=>new AudioTimeline(3600)).toThrow();
        const t=new AudioTimeline(.1);expect(()=>t.push(new Float32Array(2),0,NaN)).toThrow();
    });
    it('does not accept packets after finalization', () => {
        const t=new AudioTimeline(.01);t.finish();expect(()=>t.push(new Float32Array(2),0,48000)).toThrow();
    });
});
