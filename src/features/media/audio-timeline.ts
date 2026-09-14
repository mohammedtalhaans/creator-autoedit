/** Place decoded mono audio on one absolute sample clock.
 *
 * Resampling each decoder packet separately resets the sinc filter at every AAC
 * boundary. This assembler carries both phase and filter history across packets,
 * while respecting real timestamp gaps and codec priming before time zero.
 * The only retained source buffer is one packet plus a 24-sample filter halo.
 */
export class AudioTimeline {
    readonly pcm: Float32Array;
    private pending = new Float32Array(0);
    private origin = 0;
    private rate = 0;
    private baseFrame = 0;
    private totalFrames = 0;
    private nextOutput = 0;
    private writtenUntil = 0;
    private closed = false;
    private readonly half = 12;
    decodedFrames = 0;

    constructor(duration: number, readonly outputRate = 48000) {
        if (!Number.isFinite(duration) || duration <= 0 || duration > 301)
            throw new Error('Invalid analysis duration.');
        if (!Number.isFinite(outputRate) || outputRate < 8000 || outputRate > 192000)
            throw new Error('Invalid analysis sample rate.');
        this.pcm = new Float32Array(Math.ceil(duration * outputRate));
    }

    push(mono: Float32Array, timestamp: number, sampleRate: number): void {
        if (this.closed) throw new Error('Audio analysis has already finished.');
        if (!Number.isFinite(timestamp) || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
            throw new Error('The audio track has invalid timing or a sample rate this editor cannot process.');
        if (!mono.length) return;
        this.decodedFrames += mono.length;
        const expected = this.origin + this.totalFrames / Math.max(1, this.rate);
        const continuous = this.rate === sampleRate && Math.abs(timestamp - expected) <= .51 / sampleRate;
        if (!continuous) {
            this.flush(true);
            this.pending = new Float32Array(0);
            this.origin = timestamp;
            this.rate = sampleRate;
            this.baseFrame = this.totalFrames = 0;
            this.nextOutput = Math.max(this.writtenUntil, 0, Math.ceil(timestamp * this.outputRate - 1e-7));
        }
        const joined = new Float32Array(this.pending.length + mono.length);
        joined.set(this.pending);
        joined.set(mono, this.pending.length);
        this.pending = joined;
        this.totalFrames += mono.length;
        this.flush(false);
    }

    private flush(final: boolean): void {
        if (!this.rate || !this.pending.length) return;
        const endFrame = this.totalFrames - (final ? 0 : this.half);
        const end = Math.min(this.pcm.length, Math.ceil((this.origin + endFrame / this.rate) * this.outputRate - 1e-7));
        const cutoff = Math.min(1, this.outputRate / this.rate) * .94;
        for (let n = this.nextOutput; n < end; n++) {
            const absolute = (n / this.outputRate - this.origin) * this.rate;
            const at = absolute - this.baseFrame;
            let value = 0;
            // The normal 48 kHz phone path is a copy, not a filter or a resample.
            if (this.rate === this.outputRate && Math.abs(at - Math.round(at)) < 1e-5) {
                value = this.pending[Math.round(at)] ?? 0;
            } else {
                const center = Math.floor(at);
                let sum = 0, weights = 0;
                for (let j = center - this.half + 1; j <= center + this.half; j++) {
                    const d = at - j;
                    if (Math.abs(d) >= this.half) continue;
                    const sinc = Math.abs(d) < 1e-8 ? cutoff : Math.sin(Math.PI * d * cutoff) / (Math.PI * d);
                    const w = sinc * (.5 + .5 * Math.cos(Math.PI * d / this.half));
                    const input = this.pending[Math.max(0, Math.min(this.pending.length - 1, j))];
                    sum += (Number.isFinite(input) ? input : 0) * w;
                    weights += w;
                }
                value = weights ? sum / weights : 0;
            }
            this.pcm[n] = Number.isFinite(value) ? value : 0;
        }
        this.nextOutput = Math.max(this.nextOutput, end);
        this.writtenUntil = Math.max(this.writtenUntil, Math.min(this.pcm.length, this.nextOutput));
        const consumed = Math.min(this.pending.length, Math.max(0,
            Math.floor((this.nextOutput / this.outputRate - this.origin) * this.rate) - this.half - this.baseFrame));
        if (consumed > 0) {
            this.pending = this.pending.slice(consumed);
            this.baseFrame += consumed;
        }
    }

    finish(): Float32Array {
        if (!this.closed) {
            this.flush(true);
            this.pending = new Float32Array(0);
            this.closed = true;
        }
        return this.pcm;
    }
}
