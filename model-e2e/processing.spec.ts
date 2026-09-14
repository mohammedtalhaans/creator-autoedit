import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type {} from '../tests/browser/engine';
test.beforeEach(async ({ page }) => { await page.goto('tests/browser/index.html'); await page.waitForFunction(() => !!window.fixture); });
test('Whisper produces actual English words with valid timing on the CPU fallback', async ({ page }, info) => {
    const result = await page.evaluate(() => window.fixture.realSpeech());
    expect(result.accelerated).toBe(false);
    expect(result.words.length).toBeGreaterThan(4);
    expect(result.words.map(w => w.text).join(' ').toLowerCase()).toMatch(/best|ideas|deserve/);
    for (const [i, w] of result.words.entries()) {
        expect(Number.isFinite(w.start) && Number.isFinite(w.end)).toBe(true);
        expect(w.start).toBeGreaterThanOrEqual(i ? result.words[i - 1].start : 0);
        expect(w.end).toBeGreaterThan(w.start);
        expect(w.end).toBeLessThanOrEqual(6.1);
    }
    await info.attach('actual-transcription', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'actual-transcription.json'), `${JSON.stringify(result, null, 2)}\n`);
});
test('RNNoise loads and changes real audio without falling back to DSP alone', async ({ page }, info) => {
    const result = await page.evaluate(() => window.fixture.realNoiseReduction());
    expect(result.denoised).toBe(true); expect(result.warning).toBeUndefined();
    expect(result.finite).toBe(true); expect(result.peak).toBeLessThanOrEqual(1);
    expect(result.length).toBe(result.originalLength); expect(result.difference).toBeGreaterThan(.00001);
    await info.attach('actual-audio-measurements', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'actual-audio-measurements.json'), `${JSON.stringify(result, null, 2)}\n`);
});
test('MediaPipe tracks a moving face and reports a missed-detection fallback', async ({ page }, info) => {
    const points = await page.evaluate(() => window.fixture.realFace());
    await info.attach('actual-face-detections', { body: JSON.stringify(points, null, 2), contentType: 'application/json' });
    if (process.env.EVIDENCE_DIR)
        await writeFile(resolve(process.env.EVIDENCE_DIR, 'actual-face-detections.json'), `${JSON.stringify(points, null, 2)}\n`);
    expect(points).toHaveLength(3);
    for (const p of points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.time)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
    }
    expect(points[0].confidence).toBeGreaterThanOrEqual(.6);
    expect(points[2].confidence).toBeGreaterThanOrEqual(.6);
    expect(points[1].confidence).toBe(0);
    expect(points[1].x).toBeGreaterThanOrEqual(points[0].x);
    expect(points[1].x).toBeLessThanOrEqual(points[2].x);
    expect(points[2].x - points[0].x).toBeGreaterThan(.2);
});
