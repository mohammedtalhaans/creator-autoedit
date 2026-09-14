import { describe, it, expect } from 'vitest';
import { errorText, isAbort } from './errors';
describe('Actionable error handling', () => {
    it('preserves string explanations rather than replacing them with generic copy', () => {
        expect(errorText('Retry audio analysis before exporting.')).toBe('Retry audio analysis before exporting.');
    });
    it('preserves ordinary Error messages', () => expect(errorText(new Error('Unsupported codec'))).toBe('Unsupported codec'));
    it('supports cross-realm serialized errors', () => expect(errorText({ message: 'Model download failed' })).toBe('Model download failed'));
    it('gives safe fallback copy for missing or empty reasons', () => {
        for (const value of [undefined, null, '', '   ', new Error(''), 42, {}])
            expect(errorText(value)).toBe('Something interrupted this operation. Please try again.');
    });
    it('recognizes cancellation across worker realms', () => {
        expect(isAbort(new DOMException('Cancelled', 'AbortError'))).toBe(true);
        expect(isAbort({ name: 'AbortError' })).toBe(true);
        expect(isAbort(new Error('ordinary error'))).toBe(false);
        expect(isAbort(null)).toBe(false);
    });
});
