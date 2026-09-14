import { describe, expect, it } from 'vitest';
import { validateExport, type ExportIntegrity } from './integrity';
const expected = { width: 720, height: 1280, duration: 4, audio: true };
const valid: ExportIntegrity = { ...expected, bytes: 20000, video: { codec: 'avc', start: 0, end: 4 }, audio: { codec: 'aac', start: -.021333, end: 4.01 } };
describe('Export integrity contract', () => {
    it('accepts H.264/AAC with normal encoder priming', () => expect(() => validateExport(valid, expected)).not.toThrow());
    it('accepts intentional video-only output', () => expect(() => validateExport({ ...valid, audio: null }, { ...expected, audio: false })).not.toThrow());
    it('rejects a missing video track', () => expect(() => validateExport({ ...valid, video: null }, expected)).toThrow());
    it('rejects missing audio rather than silently saving a muted export', () => expect(() => validateExport({ ...valid, audio: null }, expected)).toThrow());
    it('rejects audio accidentally added to a silent source', () => expect(() => validateExport(valid, { ...expected, audio: false })).toThrow());
    it('rejects an incompatible codec', () => {
        expect(() => validateExport({ ...valid, video: { ...valid.video!, codec: 'vp9' } }, expected)).toThrow();
        expect(() => validateExport({ ...valid, audio: { ...valid.audio!, codec: 'opus' } }, expected)).toThrow();
    });
    it('rejects incorrect dimensions', () => expect(() => validateExport({ ...valid, width: 1080 }, expected)).toThrow());
    it('rejects truncated exports', () => expect(() => validateExport({ ...valid, duration: 3 }, expected)).toThrow());
    it('rejects invalid duration', () => expect(() => validateExport({ ...valid, duration: NaN }, expected)).toThrow());
    it('rejects a delayed audio start', () => expect(() => validateExport({ ...valid, audio: { ...valid.audio!, start: .5 } }, expected)).toThrow());
    it('rejects a truncated audio track even when container duration is correct', () => expect(() => validateExport({ ...valid, audio: { ...valid.audio!, end: 2.5 } }, expected)).toThrow());
    it('rejects audio/video end-time drift', () => expect(() => validateExport({ ...valid, video: { ...valid.video!, end: 3.87 }, audio: { ...valid.audio!, end: 4.13 } }, expected)).toThrow());
    it('rejects a zero-byte file', () => expect(() => validateExport({ ...valid, bytes: 0 }, expected)).toThrow());
});
