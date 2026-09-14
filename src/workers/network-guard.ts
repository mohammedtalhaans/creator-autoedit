export function isVisionAssetRequest(base: string, model: string, raw: string, method = 'GET'): boolean {
    try {
        const url = new URL(raw, base), runtime = new URL('runtime/vision/', base);
        if (method.toUpperCase() !== 'GET' || url.search || url.hash || url.username || url.password)
            return false;
        if (url.href === model)
            return true;
        if (url.origin !== runtime.origin || !url.pathname.startsWith(runtime.pathname))
            return false;
        return /^vision_[a-z0-9_]+\.(?:js|mjs|wasm)$/.test(url.pathname.slice(runtime.pathname.length));
    }
    catch {
        return false;
    }
}
/** MediaPipe fetch/XHR and exposed telemetry transports are restricted in its worker.
 * Exact installed-SDK network behavior still requires the release audit.
 * Only exact public model assets and same-origin runtime resources can be requested.
 * This is defence in depth in addition to the document CSP; no media crosses this API. */
export function installVisionNetworkGuard(base: string, model: string) {
    const allowed = (raw: string, method = 'GET') => isVisionAssetRequest(base, model, raw, method);
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((resource: RequestInfo | URL, init?: RequestInit) => {
        const url = resource instanceof Request ? resource.url : String(resource);
        const method = init?.method ?? (resource instanceof Request ? resource.method : 'GET');
        if (!allowed(url, method))
            return Promise.reject(new Error('Blocked a non-asset network request.'));
        return originalFetch(resource, init);
    }) as typeof fetch;
    const NativeXHR = globalThis.XMLHttpRequest;
    if (NativeXHR) {
        class AssetOnlyXHR extends NativeXHR {
            override open(method: string, url: string | URL, async = true, user?: string | null, password?: string | null) {
                if (!allowed(String(url), method))
                    throw new Error('Blocked a non-asset network request.');
                super.open(method, url, async, user, password);
            }
        }
        globalThis.XMLHttpRequest = AssetOnlyXHR;
    }
    const fail = () => { throw new Error('Network telemetry is disabled.'); };
    for (const key of ['WebSocket', 'EventSource', 'WebTransport']) {
        try {
            Object.defineProperty(globalThis, key, { value: fail, configurable: false, writable: false });
        }
        catch { /* Missing transport. */ }
    }
    try {
        Object.defineProperty(navigator, 'sendBeacon', { value: () => false, configurable: false, writable: false });
    }
    catch { /* Worker has no beacon. */ }
}
