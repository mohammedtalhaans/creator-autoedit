import { join, resolve } from 'node:path';
import { readFile, readdir, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '..');
const manifest = { generatedAt: new Date().toISOString(), assets: [], packages: [] };

// The editor ships no downloaded model runtime. Keep the same-origin runtime
// directory only for the empty manifest consumed by release diagnostics.
const runtimeDir = join(root, 'public/runtime');
await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });

// Preserve installed license notices, including transitive dependencies. Font
// binaries and optional model runtimes are never copied to the site.
const noticeDir = join(root, 'public/notices');
await rm(noticeDir, { recursive: true, force: true });
await mkdir(noticeDir, { recursive: true });
const seen = new Set();
async function inspectModules(folder) {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const dir = join(folder, entry.name);
        if (entry.name.startsWith('@')) { await inspectModules(dir); continue; }
        if (!entry.isDirectory()) continue;
        let packageInfo;
        try { packageInfo = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')); }
        catch { continue; }
        const id = `${packageInfo.name}@${packageInfo.version}`;
        if (!seen.has(id)) {
            seen.add(id);
            const notices = [];
            for (const name of await readdir(dir)) {
                if (!/^(licen[cs]e|copying|notice|authors)([._-]|$)/i.test(name)) continue;
                try {
                    const text = await readFile(join(dir, name), 'utf8');
                    const file = `${id.replaceAll('/', '__')}-${name}`;
                    await writeFile(join(noticeDir, file), text);
                    notices.push(file);
                }
                catch { /* Optional notice or package metadata is absent. */ }
            }
            manifest.packages.push({ name: packageInfo.name, version: packageInfo.version, license: packageInfo.license ?? 'REVIEW REQUIRED', repository: packageInfo.repository ?? null, notices });
        }
        await inspectModules(join(dir, 'node_modules'));
    }
}
await inspectModules(join(root, 'node_modules'));
await writeFile(join(runtimeDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(noticeDir, 'THIRD_PARTY_NOTICES.md'));
await writeFile(join(root, 'public/.nojekyll'), '');
console.log(`Prepared ${manifest.assets.length} runtime files and ${manifest.packages.length} package notices.`);
