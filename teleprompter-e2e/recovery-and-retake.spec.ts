import { stat } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { openCamera, openPrompter, openTakes, sampleScript, startTake, stopTake } from './helpers';

type TakeRow = {
  id: string;
  scriptId: string;
  status: string;
  text: string;
  chunks: number;
  bytes: number;
  playable?: boolean;
};

async function readTakeRows(page: import('@playwright/test').Page): Promise<TakeRow[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('creator-autoedit-recording');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return await new Promise<TakeRow[]>((resolve, reject) => {
      const request = db.transaction('takes', 'readonly').objectStore('takes').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result.map((take) => ({
          id: String(take.id),
          scriptId: String(take.scriptId),
          status: String(take.status),
          text: String(take.scriptSnapshot?.text ?? ''),
          chunks: Number(take.chunks ?? 0),
          bytes: Number(take.bytes ?? 0),
          playable: take.playable,
        })));
        db.close();
      };
    });
  });
}

test.describe('teleprompter recovery and take snapshots', () => {
  test('quota failure never claims Saved and immediately offers a nonempty native recovery download', async ({ page }, info) => {
    await page.addInitScript(() => {
      const state = window as typeof window & { __quotaFailure?: boolean };
      state.__quotaFailure = false;
      const originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function add(value: unknown, key?: IDBValidKey) {
        const current = window as typeof window & { __quotaFailure?: boolean };
        if (current.__quotaFailure && this.name === 'chunks') {
          current.__quotaFailure = false;
          throw new DOMException('Quota exceeded by controlled test', 'QuotaExceededError');
        }
        return arguments.length > 1 ? originalAdd.call(this, value, key) : originalAdd.call(this, value);
      };
    });
    await openPrompter(page, `QA quota ${Date.now()}`, sampleScript);
    await openCamera(page);
    await startTake(page, 2.2);
    await page.evaluate(() => { (window as typeof window & { __quotaFailure?: boolean }).__quotaFailure = true; });
    await page.getByRole('button', { name: 'Stop & save take', exact: true }).click();
    await expect(page.getByText('Recording needs attention', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.tp-global-notice')).not.toContainText('Take saved to your local library.');
    const recovery = page.getByRole('button', { name: 'Download recovered take', exact: true });
    await expect(recovery).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await recovery.click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/\.recovered\.(mp4|webm)$/i);
    const path = info.outputPath(`quota-recovery-${Date.now()}.mp4`);
    await download.saveAs(path);
    expect((await stat(path)).size).toBeGreaterThan(10_000);
    await openTakes(page);
    await expect(page.locator('.tp-take-card')).toHaveCount(1);
    await expect(page.locator('.tp-take-card').first().locator('.tp-status-error')).toBeVisible();
  });

  test('an interrupted manifest is recovered while a completed take stays playable', async ({ page }) => {
    const title = `QA interrupted ${Date.now()}`;
    await openPrompter(page, title, sampleScript);
    await openCamera(page);
    await startTake(page, 2.1);
    await stopTake(page);
    await openTakes(page);
    await expect(page.locator('.tp-take-card')).toHaveCount(1);
    const rows = await readTakeRows(page);
    const completed = rows.find((take) => take.status === 'complete');
    expect(completed?.id).toBeTruthy();

    await page.evaluate((sourceId) => {
      const dbRequest = indexedDB.open('creator-autoedit-recording');
      dbRequest.onsuccess = () => {
        const db = dbRequest.result;
        const tx = db.transaction(['takes', 'chunks'], 'readwrite');
        const takes = tx.objectStore('takes');
        const chunks = tx.objectStore('chunks');
        const takeRequest = takes.get(sourceId);
        takeRequest.onsuccess = () => {
          const source = takeRequest.result;
          if (!source) throw new Error('Completed take disappeared before recovery fixture setup.');
          const targetId = `interrupted-${Date.now()}`;
          takes.put({ ...source, id: targetId, status: 'recording', playable: false, lastHeartbeat: Date.now() - 60_000, writerSessionId: 'stale-test-writer' });
          const chunkRequest = chunks.index('takeId').getAll(sourceId);
          chunkRequest.onsuccess = () => {
            for (const chunk of chunkRequest.result) chunks.put({ ...chunk, takeId: targetId });
          };
        };
        tx.oncomplete = () => db.close();
      };
    }, completed!.id);
    await page.reload();
    await page.getByRole('button', { name: 'Record with teleprompter', exact: true }).click();
    await page.getByRole('tab', { name: 'Takes', exact: true }).click();
    await expect(page.locator('.tp-take-card')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.tp-take-card').filter({ hasText: 'Playable' })).toHaveCount(1);
    await expect(page.locator('.tp-take-card .tp-status-interrupted')).toHaveCount(1);
    expect((await readTakeRows(page)).filter((take) => take.status === 'complete')).toHaveLength(1);
  });

  test('retaking after editing the script keeps the current script snapshot and preserves the original take', async ({ page }) => {
    const title = `QA snapshot ${Date.now()}`;
    const originalText = sampleScript;
    const editedText = 'The newer script stays attached to this retake while the first recording remains immutable.';
    await openPrompter(page, title, originalText);
    await openCamera(page);
    await startTake(page, 2.1);
    await stopTake(page);
    await openTakes(page);
    await page.getByRole('tab', { name: 'Script', exact: true }).click();
    await page.locator('.tp-body-field textarea').fill(editedText);
    await page.waitForTimeout(650);
    await page.getByRole('tab', { name: 'Takes', exact: true }).click();
    await page.locator('.tp-take-card').first().getByRole('button', { name: 'Retake this section', exact: true }).click();
    await expect(page.locator('.tp-script-column')).toContainText('The newer script stays attached');
    await openCamera(page);
    await startTake(page, 2.1);
    await stopTake(page);
    const rows = await readTakeRows(page);
    const withEditedText = rows.filter((take) => take.text === editedText);
    const withOriginalText = rows.filter((take) => take.text === originalText);
    expect(withEditedText.length).toBeGreaterThan(0);
    expect(withOriginalText.length).toBeGreaterThan(0);
    expect(new Set(rows.map((take) => take.id)).size).toBeGreaterThanOrEqual(2);
  });
});
