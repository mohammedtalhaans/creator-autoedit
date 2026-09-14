import { describe, expect, it } from 'vitest';
import { resilientCache, SPEECH_REVISION } from './model';
describe('Optional local model cache', () => {
    it('uses an immutable full model revision', () => expect(/^[0-9a-f]{40}$/.test(SPEECH_REVISION)).toBe(true));
    it('treats an unreadable cache as a miss', async () => {
        const cache = resilientCache({ match: async () => { throw new Error('Private mode'); }, put: async () => {} });
        expect(await cache.match('https://example.com/model.onnx')).toBe(undefined);
    });
    it('does not fail inference on quota exhaustion', async () => {
        const cache = resilientCache({ match: async () => undefined, put: async () => { throw new Error('QuotaExceededError'); } });
        await cache.put('https://example.com/model.onnx', new Response('model'));
    });
    it('retains a successful model response', async () => {
        const response = new Response('model');
        const cache = resilientCache({ match: async () => response, put: async () => {} });
        expect(await cache.match('https://example.com/model.onnx')).toBe(response);
    });
});
