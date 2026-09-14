import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type {} from '../tests/browser/engine';
test('landing stays local and does not eagerly download processing models', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', r => requests.push(r.url()));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: /Your raw video.*minus the.*awkward parts/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /choose video/i }).first()).toBeVisible();
    expect(requests.some(u => /huggingface|mediapipe-models|rnnoise|transcription\.worker/.test(u))).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('unsupported devices receive an actionable limitation', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'VideoEncoder', { value: undefined, configurable: true }));
    await page.goto('./');
    await expect(page.getByText(/MP4 export is not available|browser cannot decode video/i).first()).toBeVisible();
});
for (const noAudio of [false, true])
    test(`real MP4 pipeline ${noAudio ? 'without' : 'with'} audio`, async ({ page }, info) => {
        await page.goto('tests/browser/index.html');
        await page.waitForFunction(() => !!window.fixture);
        const support = await page.evaluate(v => window.fixture.prepare(v), noAudio);
        if (!support.supported && process.env.REQUIRE_MEDIA_EXPORT?.split(',').includes(info.project.name)) throw new Error(`${info.project.name}: ${support.reason || 'Required native codec support unavailable'}`);
        test.skip(!support.supported, `Required native codec support is unavailable: ${support.reason}. This skip is NOT device acceptance.`);
        const result = await page.evaluate(v => window.fixture.exportFixture(v), noAudio);
        expect(result.size).toBeGreaterThan(1000);
        expect(result.width).toBe(720);
        expect(result.height).toBe(1280);
        expect(result.videoCodec).toBe('avc');
        expect(result.audioCodec).toBe(noAudio ? null : 'aac');
        expect(Math.abs(result.duration - result.expectedDuration)).toBeLessThan(.15);
        expect(result.frames).toBeGreaterThan(20);
        expect(result.nonBlack).toBe(result.checked);
        if (!noAudio) expect(result.captionPixels).toBeGreaterThan(0);
        if (!noAudio && process.env.EVIDENCE_DIR)
            await writeFile(resolve(process.env.EVIDENCE_DIR, 'development-with-audio-export-metadata.json'), `${JSON.stringify(result, null, 2)}\n`);
        if (!noAudio) {
            expect(result.samples).toBeGreaterThan(0);
            expect(Math.abs(result.audioEnd - result.videoEnd)).toBeLessThan(.1);
        }
        await info.attach('actual-export-metadata', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
        await page.waitForTimeout(50);
        await page.evaluate(async (url) => {
            const v = document.createElement('video');
            v.muted = true;
            v.src = url;
            document.body.append(v);
            await new Promise<void>((resolve, reject) => {
                if (v.readyState >= 2) { resolve(); return; }
                const done = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error('Export video could not decode')); };
                const cleanup = () => { v.removeEventListener('loadeddata', done); v.removeEventListener('error', fail); };
                v.addEventListener('loadeddata', done, { once: true });
                v.addEventListener('error', fail, { once: true });
            });
            await v.play();
            await new Promise(r => setTimeout(r, 300));
            if (v.currentTime <= 0)
                throw new Error('Export did not play');
            v.pause();
            v.remove();
        }, result.url);
    });
test('review controls change the real project and preserve word timing', async ({ page }) => {
    await page.goto('tests/browser/index.html');
    await page.waitForFunction(() => !!window.fixture);
    const support = await page.evaluate(() => window.fixture.prepare());
    test.skip(!support.supported, 'Native fixture codec unavailable');
    await page.getByRole('button', { name: 'Tight', exact: true }).click();
    expect(await page.evaluate(() => window.fixture.project()?.cutPreset)).toBe('tight');
    await page.getByRole('tab', { name: 'Captions', exact: true }).click();
    await page.getByRole('button', { name: /Punch/i }).first().click();
    expect(await page.evaluate(() => window.fixture.project()?.captions.preset)).toBe('punch');
    const before = await page.evaluate(() => window.fixture.project()?.words.map(w => [w.start, w.end]));
    const phrase = page.getByRole('textbox', { name: /Caption phrase at/ }).first();
    await phrase.fill('Our best ideas deserve to be');
    await phrase.press('Enter');
    expect(await page.evaluate(() => window.fixture.project()?.words[0].text)).toBe('Our');
    expect(await page.evaluate(() => window.fixture.project()?.words.map(w => [w.start, w.end]))).toEqual(before);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
