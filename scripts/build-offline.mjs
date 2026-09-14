import { createHash } from 'node:crypto';

const precacheExtensions = new Set(['.css', '.js', '.svg', '.woff', '.woff2']);

function normalizeBase(value) {
  const raw = String(value || '/');
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function assetBytes(asset) {
  if (asset.type === 'chunk') return Buffer.from(asset.code, 'utf8');
  return Buffer.isBuffer(asset.source) ? asset.source : Buffer.from(asset.source);
}

function assetExtension(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase();
}

function serviceWorkerSource({ base, shellCache, precache }) {
  const runtimePrefix = `${base}runtime/`;
  const cachePrefix = shellCache.slice(0, shellCache.lastIndexOf('-shell-'));
  const runtimeCache = `${cachePrefix}-runtime-${shellCache.slice(shellCache.lastIndexOf('-shell-') + 7)}`;
  return `/* Creator AutoEdit offline shell. Generated at build time. */
const BASE_URL = ${JSON.stringify(base)};
const RUNTIME_PREFIX = ${JSON.stringify(runtimePrefix)};
const SHELL_CACHE = ${JSON.stringify(shellCache)};
const RUNTIME_CACHE = ${JSON.stringify(runtimeCache)};
const PRECACHE = ${JSON.stringify(precache)};
const RUNTIME_FILE = /\\.(?:js|mjs|json|wasm)$/i;
const PRECACHED_PATHS = new Set(PRECACHE.map((value) => new URL(value, self.location.origin).pathname));

self.addEventListener('install', (event) => {
  // Leave this worker waiting. A new shell must never interrupt an active
  // recording by replacing the worker underneath an open capture tab.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const ownPrefix = ${JSON.stringify(cachePrefix)};
    await Promise.all(keys
      .filter((key) => key.startsWith(ownPrefix) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    // A full runtime cache must never turn a successful model/WASM response
    // into a failed application request when storage is temporarily full.
    try { await cache.put(request, response.clone()); } catch { /* best effort */ }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_URL)) return;

  if (request.mode === 'navigate') {
    const shellUrl = new URL('index.html', self.location.origin + BASE_URL).href;
    const shellCache = caches.open(SHELL_CACHE);
    event.respondWith(shellCache.then((cache) => cache.match(shellUrl).then((hit) => hit || fetch(request))));
    return;
  }

  if (url.pathname.startsWith(RUNTIME_PREFIX) && RUNTIME_FILE.test(url.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Only generated shell assets are served from this cache. Recording
  // manifests, chunks and blob URLs live in IndexedDB or the browser media
  // stack and are never copied into Cache Storage by this worker.
  if (!PRECACHED_PATHS.has(url.pathname)) return;
  event.respondWith(caches.open(SHELL_CACHE).then((cache) => cache.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request))));
});
`;
}

/**
 * Emit a scope-safe service worker alongside the Vite output. The shell list
 * is derived from the actual hashed bundle so stale source names never enter
 * the precache. Runtime/model assets remain an allowlisted cache-on-first-use
 * path and are intentionally excluded from the initial install.
 */
export function offlineServiceWorker(options = {}) {
  const base = normalizeBase(options.base || process.env.BASE_PATH || '/creator-autoedit/');
  return {
    name: 'creator-autoedit-offline-shell',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      const names = [];
      const hash = createHash('sha256');
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (fileName === 'sw.js' || fileName.endsWith('.map')) continue;
        if (fileName === 'index.html' || precacheExtensions.has(assetExtension(fileName))) {
          names.push(fileName);
          hash.update(fileName);
          hash.update(assetBytes(asset));
        }
      }
      // Public assets are copied after Rollup has generated the bundle and do
      // not appear in `bundle`; mark.svg is the only required public shell
      // asset. Runtime files are fetched lazily by the worker allowlist.
      if (!names.includes('index.html')) names.push('index.html');
      names.push('mark.svg');
      names.sort();
      hash.update(base);
      hash.update(JSON.stringify(names));
      const revision = hash.digest('hex').slice(0, 16);
      const scopeHash = createHash('sha256').update(base).digest('hex').slice(0, 8);
      const precache = names.map((name) => `${base}${name}`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource({ base, shellCache: `creator-autoedit-${scopeHash}-shell-${revision}`, precache }) });
    },
  };
}

export default offlineServiceWorker;
