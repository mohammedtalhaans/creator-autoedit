import { test, expect } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe('native recording engine', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Controlled fake camera/microphone flags are verified in Chromium.');

  test('records real MediaRecorder media, reloads it, and keeps retakes independent', async ({ page }) => {
    await page.goto('tests/browser/recording-engine.html');
    await page.waitForFunction(() => !!window.recordingFixture);

    const first = await page.evaluate(() => window.recordingFixture.capture());
    expect(first.status).toBe('complete');
    expect(first.bytes).toBeGreaterThan(0);
    expect(first.chunks).toBeGreaterThan(0);
    expect(first.mimeType.startsWith('video/')).toBe(true);
    const firstDecoded = await page.evaluate((id) => window.recordingFixture.inspect(id), first.id);
    expect(firstDecoded.canDecodeVideo).toBe(true);
    expect(firstDecoded.canDecodeAudio).toBe(true);
    expect(firstDecoded.duration).toBeGreaterThan(0);

    await page.reload();
    await page.waitForFunction(() => !!window.recordingFixture);
    const afterReload = await page.evaluate(() => window.recordingFixture.list());
    expect(afterReload.map((take) => take.id)).toContain(first.id);
    const second = await page.evaluate(() => window.recordingFixture.capture());
    expect(second.status).toBe('complete');
    expect(second.id).not.toBe(first.id);
    expect((await page.evaluate(() => window.recordingFixture.list())).map((take) => take.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    const stitched = await page.evaluate((ids) => window.recordingFixture.stitch(ids), [first.id, second.id]);
    expect(stitched.bytes).toBeGreaterThan(0);
    expect(stitched.canDecodeVideo).toBe(true);
    expect(stitched.canDecodeAudio).toBe(true);
    expect(stitched.duration).toBeGreaterThan(firstDecoded.duration + 1.5);

    await page.evaluate(() => window.recordingFixture.close());
  });
});
