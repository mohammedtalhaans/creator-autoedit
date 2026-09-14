import { test, expect } from '@playwright/test';
import { openCamera, openPrompter, openTakes, sampleScript, startTake, stopTake } from './helpers';

test.describe('built offline shell', () => {
  test('installs under the repository subpath, reloads offline, and records through IndexedDB without models', async ({ page, context }) => {
    const writes: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });

    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Record with teleprompter', exact: true })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
    const workerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const shellName = cacheNames.find((name) => name.includes('-shell-')) ?? '';
      const shell = shellName ? await caches.open(shellName) : null;
      const shellUrls = shell ? (await shell.keys()).map((request) => new URL(request.url).pathname) : [];
      return { scope: registration.scope, script: registration.active?.scriptURL ?? '', cacheNames, shellName, shellUrls };
    });
    expect(workerState.scope).toBe('http://127.0.0.1:4300/creator-autoedit/');
    expect(workerState.script).toMatch(/\/creator-autoedit\/sw\.js$/);
    expect(workerState.shellName).toMatch(/^creator-autoedit-[0-9a-f]+-shell-[0-9a-f]+$/);
    expect(workerState.shellUrls).toContain('/creator-autoedit/index.html');
    expect(workerState.shellUrls.some((url) => /\.js$/.test(url))).toBe(true);
    expect(workerState.shellUrls.some((url) => /\.css$/.test(url))).toBe(true);
    expect(workerState.shellUrls.some((url) => /\.woff2?$/.test(url))).toBe(true);
    expect(workerState.shellUrls.some((url) => /\.wasm$/.test(url))).toBe(false);
    expect(workerState.cacheNames.some((name) => name.includes('-runtime-'))).toBe(false);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Your raw video.*awkward parts/i })).toBeVisible();
    await openPrompter(page, `QA offline ${Date.now()}`, sampleScript);
    await openCamera(page);
    await startTake(page, 2.2);
    await stopTake(page);
    await openTakes(page);
    await expect(page.locator('.tp-take-card')).toHaveCount(1);
    await expect(page.locator('.tp-take-card').first().getByText('Playable', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
});
