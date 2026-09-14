import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

async function saveEvidence(page: Page, filename: string) {
    const dir = process.env.EVIDENCE_DIR;
    if (dir) await page.screenshot({ path: resolve(dir, filename), fullPage: true });
}

async function waitForPreview(page: Page) {
    await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    try {
        await page.waitForFunction(() => {
            const canvas = document.querySelector('canvas[role="img"]') as HTMLCanvasElement | null;
            if (!canvas || canvas.width < 2 || canvas.height < 2) return false;
            const context = canvas.getContext('2d');
            if (!context) return false;
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let total = 0;
            for (let i = 0; i < pixels.length; i += 4) total += pixels[i] + pixels[i + 1] + pixels[i + 2];
            return total / (pixels.length / 4 * 3) > 2;
        }, undefined, { timeout: 10_000 });
    }
    catch (error) {
        const state = await page.evaluate(() => {
            const video = document.querySelector('video.decode-video') as HTMLVideoElement | null;
            const canvas = document.querySelector('canvas[role="img"]') as HTMLCanvasElement | null;
            const context = canvas?.getContext('2d');
            const pixels = canvas && context ? context.getImageData(0, 0, canvas.width, canvas.height).data : new Uint8ClampedArray();
            let total = 0;
            for (let i = 0; i < pixels.length; i += 4) total += pixels[i] + pixels[i + 1] + pixels[i + 2];
            return { readyState: video?.readyState ?? null, videoWidth: video?.videoWidth ?? 0, videoHeight: video?.videoHeight ?? 0, canvasWidth: canvas?.width ?? 0, canvasHeight: canvas?.height ?? 0, mean: pixels.length ? total / (pixels.length / 4 * 3) : 0 };
        });
        throw new Error(`Preview remained blank after decode/settle: ${JSON.stringify(state)}; ${String(error)}`);
    }
}

async function inspectRenderedVideo(page: Page) {
    const video = page.locator('video[aria-label="Your finished exported MP4"]');
    await expect(video).toBeVisible();
    return video.evaluate(async element => {
        const media = element as HTMLVideoElement & { captureStream?: () => MediaStream; webkitAudioDecodedByteCount?: number };
        const metadata = () => new Promise<void>((resolve, reject) => {
            if (media.readyState >= 1) { resolve(); return; }
            const done = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error('Export video metadata failed')); };
            const cleanup = () => { media.removeEventListener('loadedmetadata', done); media.removeEventListener('error', fail); };
            media.addEventListener('loadedmetadata', done, { once: true });
            media.addEventListener('error', fail, { once: true });
        });
        await metadata();
        let played = false;
        try { await media.play(); played = true; } catch { /* autoplay policy may require a user gesture */ }
        await new Promise(resolve => setTimeout(resolve, 250));
        const stream = media.captureStream?.();
        const audioTracks = stream?.getAudioTracks().length ?? null;
        stream?.getTracks().forEach(track => track.stop());
        if (played) media.pause();

        const canvas = document.createElement('canvas');
        canvas.width = 72; canvas.height = 128;
        const context = canvas.getContext('2d');
        let samples = 0, brightestMean = 0;
        if (context && Number.isFinite(media.duration) && media.duration > 0) {
            for (const requested of [.2, media.duration / 2, Math.max(.2, media.duration - .2)]) {
                const time = Math.min(Math.max(0, media.duration - .01), requested);
                await new Promise<void>(resolve => {
                    if (Math.abs(media.currentTime - time) < .02) { resolve(); return; }
                    const done = () => { media.removeEventListener('seeked', done); resolve(); };
                    media.addEventListener('seeked', done, { once: true });
                    media.currentTime = time;
                });
                context.drawImage(media, 0, 0, canvas.width, canvas.height);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let total = 0;
                for (let i = 0; i < pixels.length; i += 4) total += pixels[i] + pixels[i + 1] + pixels[i + 2];
                brightestMean = Math.max(brightestMean, total / (pixels.length / 4 * 3));
                samples++;
            }
        }
        return { width: media.videoWidth, height: media.videoHeight, duration: media.duration, audioTracks, audioDecodedBytes: media.webkitAudioDecodedByteCount ?? null, samples, brightestMean };
    });
}

async function requireEditingCapability(page: Page, browserName: string) {
    // The button gets this label only after actual codec probes finish.
    const choose = page.getByRole('button', { name: /choose video/i }).first();
    await expect(choose).toBeVisible();
    if (await choose.isEnabled()) return;
    await expect(page.getByRole('status').filter({ hasText: /different browser|open in your browser/i })).toBeVisible();
    if (process.env.REQUIRE_MEDIA_EXPORT?.split(',').includes(browserName))
        throw new Error(`${browserName}: the required production codec probe rejected local editing`);
    test.skip(true, 'Actual codec probe rejected editing. Unsupported-browser messaging works; this is not an export or corrupt-file acceptance pass.');
}

test('built application loads under its deployment subpath with no eager models', async ({ page }) => {
    const failures: string[] = [], requests: string[] = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
    page.on('request', r => requests.push(r.url()));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: /Your raw video.*minus the.*awkward parts/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /choose video/i }).first()).toBeVisible();
    await saveEvidence(page, 'production-home-desktop.png');
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);
    expect(requests.some(u => /huggingface|mediapipe-models|rnnoise|transcription\.worker/.test(u))).toBe(false);
    expect(failures).toEqual([]);
    for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await saveEvidence(page, 'production-home-mobile.png');
});

test('a malformed local file produces a recoverable error, never a crash', async ({ page, browserName }) => {
    await page.goto('./');
    await requireEditingCapability(page, browserName);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'damaged.mp4', mimeType: 'video/mp4', buffer: Buffer.from('This is not a valid MP4.') });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to the studio' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to the studio' }).click();
    await expect(page.getByRole('button', { name: /choose video/i }).first()).toBeVisible();
});

test('built with-audio workflow exports a decoded H.264/AAC MP4 from the shipped UI', async ({ page, browserName }, info) => {
    // Keep this acceptance run bounded and deterministic: the separate model suite owns real model downloads.
    await page.route('https://storage.googleapis.com/**', route => route.abort('internetdisconnected'));
    await page.route('https://huggingface.co/**', route => route.abort('internetdisconnected'));
    await page.route('https://*.huggingface.co/**', route => route.abort('internetdisconnected'));
    await page.route('https://*.hf.co/**', route => route.abort('internetdisconnected'));
    const unexpectedWrites: string[] = [];
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) unexpectedWrites.push(`${request.method()} ${request.url()}`); });
    await page.goto('./');
    await requireEditingCapability(page, browserName);
    await page.locator('input[type=file]').first().setInputFiles(resolve('tests/fixtures/tiny.mp4'));
    await expect(page.getByRole('button', { name: 'Export Reel', exact: true }).first()).toBeEnabled({ timeout: 120_000 });
    await waitForPreview(page);
    await saveEvidence(page, 'production-editor-with-audio-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForPreview(page);
    await saveEvidence(page, 'production-editor-with-audio-mobile.png');
    await page.setViewportSize({ width: 768, height: 900 });
    await waitForPreview(page);
    await saveEvidence(page, 'production-editor-with-audio-landscape.png');
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForPreview(page);
    await page.getByRole('button', { name: 'Export Reel', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('AAC · MONO', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: /Standard/ }).click();
    await dialog.getByRole('button', { name: 'Export Reel', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Ready.*to post/i })).toBeVisible({ timeout: 120_000 });
    const metrics = await inspectRenderedVideo(page);
    expect(metrics.width).toBe(720);
    expect(metrics.height).toBe(1280);
    expect(metrics.duration).toBeGreaterThan(1);
    expect(metrics.samples).toBeGreaterThanOrEqual(2);
    expect(metrics.brightestMean).toBeGreaterThan(8);
    if (browserName === 'chromium') expect(metrics.audioTracks ?? metrics.audioDecodedBytes ?? 0).toBeGreaterThan(0);
    await info.attach('production-audio-export-metadata', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'production-with-audio-browser-metadata.json'), `${JSON.stringify(metrics, null, 2)}\n`);
    await saveEvidence(page, 'production-complete-with-audio-desktop.png');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save video', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
    const path = info.outputPath('built-with-audio.mp4');
    await download.saveAs(path);
    await info.attach('production-audio-export-file', { path, contentType: 'video/mp4' });
    expect(unexpectedWrites).toEqual([]);
});

test('built no-audio workflow exports through the shipped UI and stays private', async ({ page, browserName }, info) => {
    // Deliberately test the documented offline face-model failure path. No model output is substituted.
    await page.route('https://storage.googleapis.com/**', route => route.abort('internetdisconnected'));
    const unexpectedWrites: string[] = [];
    page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) unexpectedWrites.push(`${r.method()} ${r.url()}`); });
    await page.goto('./');
    await requireEditingCapability(page, browserName);
    await page.locator('input[type=file]').first().setInputFiles(resolve('tests/fixtures/no-audio.mp4'));
    await expect(page.getByRole('button', { name: 'Export Reel', exact: true }).first()).toBeEnabled({ timeout: 90_000 });
    await waitForPreview(page);
    await saveEvidence(page, 'production-editor-no-audio-desktop.png');
    await page.getByRole('button', { name: 'Export Reel', exact: true }).first().click();
    await expect(page.getByText('NO AUDIO', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Standard/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Export Reel', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Ready.*to post/i })).toBeVisible({ timeout: 120_000 });
    const metrics = await inspectRenderedVideo(page);
    expect(metrics.width).toBe(720);
    expect(metrics.height).toBe(1280);
    expect(metrics.duration).toBeGreaterThan(1);
    expect(metrics.samples).toBeGreaterThanOrEqual(2);
    expect(metrics.brightestMean).toBeGreaterThan(8);
    if (browserName === 'chromium') expect(metrics.audioTracks ?? metrics.audioDecodedBytes ?? 0).toBe(0);
    await info.attach('production-no-audio-export-metadata', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'production-no-audio-browser-metadata.json'), `${JSON.stringify(metrics, null, 2)}\n`);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save video', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
    const path = info.outputPath('built-no-audio.mp4');
    await download.saveAs(path);
    await info.attach('exported-file', { path, contentType: 'video/mp4' });
    expect(unexpectedWrites).toEqual([]);
    page.once('dialog', d => d.accept());
    await page.reload();
    await expect(page.getByRole('heading', { name: /Your raw video/i })).toBeVisible();
    expect(await page.locator('video').count()).toBe(0);
});
