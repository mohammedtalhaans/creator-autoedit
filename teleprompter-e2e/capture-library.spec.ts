import { stat } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
  choosePromptMode,
  currentPromptWord,
  openCamera,
  openPrompter,
  openTakes,
  saveScreenshot,
  sampleScript,
  startTake,
  stopTake,
} from './helpers';

test.describe('native teleprompter capture and take library', () => {
  test('records real camera and microphone media, keeps prompt pause independent, and retains retakes', async ({ page }, info) => {
    const title = `QA capture ${Date.now()}`;
    await openPrompter(page, title, sampleScript.repeat(2));
    await choosePromptMode(page, 'Fixed pace');
    await page.locator('.tp-script-column .tp-token').nth(5).click();
    await openCamera(page);

    const streamBefore = await page.locator('video[aria-label="Camera preview"]').evaluate((video) => {
      const stream = (video as HTMLVideoElement).srcObject as MediaStream | null;
      return {
        videoTracks: stream?.getVideoTracks().map((track) => ({ kind: track.kind, state: track.readyState })) ?? [],
        audioTracks: stream?.getAudioTracks().map((track) => ({ kind: track.kind, state: track.readyState })) ?? [],
      };
    });
    expect(streamBefore.videoTracks).toEqual([{ kind: 'video', state: 'live' }]);
    expect(streamBefore.audioTracks).toEqual([{ kind: 'audio', state: 'live' }]);

    const composite = await page.evaluate(() => {
      const viewfinder = document.querySelector('.tp-record-viewfinder')?.getBoundingClientRect();
      const overlay = document.querySelector('.tp-record-reader-overlay')?.getBoundingClientRect();
      const video = document.querySelector('video[aria-label="Camera preview"]')?.getBoundingClientRect();
      const activeElement = document.querySelector('.tp-record-reader-overlay .tp-token.tp-current');
      const active = activeElement?.getBoundingClientRect();
      const adjacent = activeElement?.parentElement?.querySelector('.tp-token.tp-future');
      return {
        viewfinder: viewfinder ? { x: viewfinder.x, y: viewfinder.y, width: viewfinder.width, height: viewfinder.height } : null,
        overlay: overlay ? { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height } : null,
        video: video ? { x: video.x, y: video.y, width: video.width, height: video.height } : null,
        active: active ? { x: active.x, y: active.y, right: active.right, width: active.width, height: active.height } : null,
        activeBackground: activeElement ? getComputedStyle(activeElement).backgroundColor : '',
        adjacentOpacity: adjacent ? getComputedStyle(adjacent).opacity : '',
      };
    });
    expect(composite.viewfinder?.width ?? 0).toBeGreaterThan(0);
    expect(composite.overlay?.width ?? 0).toBeGreaterThan(0);
    expect(Math.abs((composite.overlay?.x ?? 0) - (composite.viewfinder?.x ?? 0))).toBeLessThan(2);
    expect(Math.abs((composite.overlay?.y ?? 0) - (composite.viewfinder?.y ?? 0))).toBeLessThan(2);
    expect(Math.abs((composite.overlay?.width ?? 0) - (composite.viewfinder?.width ?? 0))).toBeLessThan(2);
    expect(Math.abs((composite.overlay?.height ?? 0) - (composite.viewfinder?.height ?? 0))).toBeLessThan(2);
    expect(composite.video?.width ?? 0).toBeGreaterThan(0);
    expect(composite.active?.width ?? 0).toBeGreaterThan(0);
    expect(composite.active?.x ?? 0).toBeGreaterThanOrEqual(composite.viewfinder?.x ?? 0);
    expect(composite.active?.right ?? 0).toBeLessThanOrEqual((composite.viewfinder?.x ?? 0) + (composite.viewfinder?.width ?? 0));
    expect(composite.activeBackground).not.toBe('rgba(0, 0, 0, 0)');

    const startWord = await page.locator('.tp-script-column .tp-token').evaluateAll((tokens) => tokens.findIndex((token) => token.classList.contains('tp-current')) + 1);
    expect(startWord).toBeGreaterThan(0);

    await startTake(page, 2.4);
    await expect(page.getByRole('button', { name: 'Pause prompt', exact: true })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Pause prompt', exact: true }).click();
    const promptAfterPause = await currentPromptWord(page);
    await page.waitForTimeout(500);
    expect(await currentPromptWord(page)).toBe(promptAfterPause);
    await expect(page.getByRole('status').filter({ hasText: /Recording\./i })).toBeVisible();
    await page.evaluate(() => {
      const state = window as typeof window & { __teleprompterOriginalRaf?: typeof requestAnimationFrame };
      state.__teleprompterOriginalRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
    });
    expect(await page.locator('.tp-record-pill').innerText()).toContain('REC');
    await page.waitForTimeout(350);
    const streamDuring = await page.locator('video[aria-label="Camera preview"]').evaluate((video) => {
      const stream = (video as HTMLVideoElement).srcObject as MediaStream | null;
      return stream?.getTracks().map((track) => track.readyState) ?? [];
    });
    expect(streamDuring).toEqual(['live', 'live']);
    await page.evaluate(() => {
      const state = window as typeof window & { __teleprompterOriginalRaf?: typeof requestAnimationFrame };
      if (state.__teleprompterOriginalRaf) window.requestAnimationFrame = state.__teleprompterOriginalRaf;
    });
    await stopTake(page);
    await expect(page.locator('.tp-global-notice')).toContainText('Take saved to your local library.');
    const committed = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('creator-autoedit-recording');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      return await new Promise<{ status: string; chunks: number; bytes: number; duration: number }>((resolve, reject) => {
        const request = db.transaction('takes', 'readonly').objectStore('takes').getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const take = request.result.filter((item) => item.status === 'complete').sort((a, b) => b.createdAt - a.createdAt)[0];
          resolve({ status: take?.status ?? '', chunks: take?.chunks ?? 0, bytes: take?.bytes ?? 0, duration: take?.duration ?? 0 });
          db.close();
        };
      });
    });
    expect(committed.status).toBe('complete');
    expect(committed.chunks).toBeGreaterThan(0);
    expect(committed.bytes).toBeGreaterThan(10_000);
    expect(committed.duration).toBeGreaterThan(2);
    await openTakes(page);
    await expect(page.locator('.tp-take-card')).toHaveCount(1);
    const firstCard = page.locator('.tp-take-card').first();
    await expect(firstCard.getByText('Playable', { exact: true })).toBeVisible();
    await expect(firstCard.getByText(`from word ${startWord}`, { exact: true })).toBeVisible();
    await firstCard.getByRole('button', { name: 'Favourite take', exact: true }).click();
    await expect(firstCard.getByRole('button', { name: 'Remove favourite', exact: true })).toBeVisible();
    await saveScreenshot(page, info, 'teleprompter-take-library-first.png');

    await firstCard.getByRole('button', { name: 'Retake this section', exact: true }).click();
    await expect(page.getByRole('button', { name: /Record another take|Start recording/, exact: false })).toBeVisible();
    await startTake(page, 2.2);
    await stopTake(page);
    await openTakes(page);
    await expect(page.locator('.tp-take-card')).toHaveCount(2);
    const cards = page.locator('.tp-take-card');
    await cards.nth(0).getByRole('button', { name: 'Compare this take', exact: true }).click();
    await cards.nth(1).getByRole('button', { name: 'Compare this take', exact: true }).click();
    await expect(page.getByText('Compare A / B', { exact: true })).toBeVisible();

    const downloadEvent = page.waitForEvent('download');
    await cards.nth(0).getByRole('button', { name: 'Download original', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/\.(mp4|webm)$/i);
    const filePath = info.outputPath(`teleprompter-original-${Date.now()}.mp4`);
    await download.saveAs(filePath);
    expect((await stat(filePath)).size).toBeGreaterThan(10_000);
    await saveScreenshot(page, info, 'teleprompter-take-library-retakes.png');
  });
});
