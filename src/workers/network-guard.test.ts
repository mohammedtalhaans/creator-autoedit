import { describe, it, expect } from 'vitest';
import { isVisionAssetRequest } from './network-guard';
const base = 'https://owner.github.io/creator-autoedit/', model = 'https://storage.googleapis.com/mediapipe-models/face_detector/model.tflite';
describe('face-worker asset-only network policy', () => {
    it('allows only the exact public model', () => { expect(isVisionAssetRequest(base, model, model)).toBe(true); expect(isVisionAssetRequest(base, model, model + '?audio=data')).toBe(false); });
    it('allows known local runtime filenames under the repository base', () => { expect(isVisionAssetRequest(base, model, base + 'runtime/vision/vision_wasm_internal.wasm')).toBe(true); });
    it('blocks POST even to an otherwise allowed model', () => { expect(isVisionAssetRequest(base, model, model, 'POST')).toBe(false); });
    it('blocks telemetry hosts and same-origin collection paths', () => {
        for (const url of ['https://example.com/metrics', base + 'metrics', base + 'runtime/vision/metrics'])
            expect(isVisionAssetRequest(base, model, url)).toBe(false);
    });
    it('blocks directory traversal and runtime query payloads', () => {
        for (const url of [base + 'runtime/vision/../metrics', base + 'runtime/vision/vision_wasm_internal.js?data=private', base + 'runtime/vision/%2e%2e/metrics'])
            expect(isVisionAssetRequest(base, model, url)).toBe(false);
    });
    it('rejects lookalike origins and credential-bearing URLs', () => { expect(isVisionAssetRequest(base, model, 'https://owner.github.io.evil.test/creator-autoedit/runtime/vision/vision_a.js')).toBe(false); expect(isVisionAssetRequest(base, model, 'https://user:secret@owner.github.io/creator-autoedit/runtime/vision/vision_a.js')).toBe(false); });
});
