/** Local test server only. The deployed application has no server component. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '../dist');
const base = `/${(process.env.BASE_PATH || '/creator-autoedit/').split('/').filter(Boolean).join('/')}/`.replace('//', '/');
const port = Number(process.env.PORT || 4174);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const server = createServer(async (req, res) => {
    try {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith(base)) { res.writeHead(404); res.end('Outside deployment base'); return; }
        const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
        if (!(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
        const bytes = await readFile(file);
        const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
        // Native video seeking is part of the built-site test, including byte-range requests.
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        if (range) {
            const start = Number(range[1]), end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
            if (start > end || start >= bytes.length) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); res.end(); return; }
            res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
            res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return;
        }
        res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
        res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Built app: http://127.0.0.1:${port}${base}`));
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => server.close());
