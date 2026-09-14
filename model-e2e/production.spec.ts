import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

test('built app runs the real caption worker under its production CSP and exact subpath', async ({ page }, info) => {
    test.setTimeout(15 * 60_000);
    const requests: string[] = [], failures: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto('./');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src[^;]*huggingface/);
    await page.locator('input[type=file]').first().setInputFiles(resolve('tests/fixtures/tiny.mp4'));
    await expect(page.getByRole('button', { name: 'Export Reel', exact: true }).first()).toBeEnabled({ timeout: 180_000 });
    await page.getByRole('tab', { name: 'Captions', exact: true }).click();
    const phrase = page.locator('textarea[aria-label^="Caption phrase at "]').first();
    await expect(phrase).toBeVisible({ timeout: 15 * 60_000 });
    const text = await phrase.inputValue();
    expect(text.trim().length).toBeGreaterThan(0);
    expect(requests.some(url => /huggingface|\.hf\.co/.test(url))).toBe(true);
    expect(failures.filter(message => !/source map/i.test(message))).toEqual([]);
    const result = { text, requestCount: requests.length, modelRequests: requests.filter(url => /huggingface|\.hf\.co/.test(url)).length, subpath: new URL(page.url()).pathname };
    await info.attach('production-csp-transcription', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'production-csp-transcription.json'), `${JSON.stringify(result, null, 2)}\n`);
});

test('built face worker loads its same-origin WASM bridge under the production CSP', async ({ page }, info) => {
    test.setTimeout(180_000);
    const requests: string[] = [], failures: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => failures.push(error.message));
    await page.goto('./');
    await page.locator('input[type=file]').first().setInputFiles(resolve('tests/fixtures/tiny.mp4'));
    await expect(page.getByRole('button', { name: 'Export Reel', exact: true }).first()).toBeEnabled({ timeout: 180_000 });
    await expect.poll(() => requests.filter(url => /runtime\/vision\/vision_.*\.(?:js|wasm)/.test(url)).length, { timeout: 120_000 }).toBeGreaterThan(0);
    expect(requests.some(url => /storage\.googleapis\.com\/mediapipe-models/.test(url))).toBe(true);
    expect(failures.filter(message => !/source map/i.test(message))).toEqual([]);
    const result = { visionRuntimeRequests: requests.filter(url => /runtime\/vision\/vision_.*\.(?:js|wasm)/.test(url)).length, faceModelRequests: requests.filter(url => /storage\.googleapis\.com\/mediapipe-models/.test(url)).length, subpath: new URL(page.url()).pathname };
    await info.attach('production-csp-face-runtime', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'production-csp-face-runtime.json'), `${JSON.stringify(result, null, 2)}\n`);
});
