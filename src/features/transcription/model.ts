/** Immutable asset revision: a model update must be reviewed and re-tested before release. */
export const SPEECH_MODEL = 'Xenova/whisper-tiny.en';
export const SPEECH_REVISION = '79fb389fc764e7c395bd330e9531d9d32ada7049';
export const MODEL_CACHE = 'creator-autoedit-models-v2';
/** Cache failure (quota, private mode, eviction) must never prevent local inference. */
export function resilientCache(cache: Pick<Cache, 'match' | 'put'>) {
    return {
        async match(request: RequestInfo | URL): Promise<Response | undefined> {
            try { return await cache.match(request); } catch { return undefined; }
        },
        async put(request: RequestInfo | URL, response: Response): Promise<void> {
            try { await cache.put(request, response); } catch { /* Keep inference available without persistence. */ }
        },
    };
}
