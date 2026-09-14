import { test, expect } from '@playwright/test';
import {
  choosePromptMode,
  currentPromptWord,
  minimalDocx,
  openPrompter,
  promptSliderValue,
  saveScreenshot,
  setPromptSlider,
  sampleScript,
  settlePage,
} from './helpers';

test.describe('teleprompter rehearsal and script desk', () => {
  test('opens read-only without requesting camera, microphone, models, or network writes', async ({ page }) => {
    const mediaCalls: Array<{ audio?: unknown; video?: unknown }> = [];
    const nonGets: string[] = [];
    const modelRequests: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) nonGets.push(`${request.method()} ${request.url()}`);
      if (/huggingface|mediapipe-models|runtime\/ort|runtime\/vision/i.test(request.url())) modelRequests.push(request.url());
    });
    await page.goto('./');
    await page.evaluate(() => {
      const media = navigator.mediaDevices;
      if (!media?.getUserMedia) throw new Error('getUserMedia is unavailable in the test browser');
      const original = media.getUserMedia.bind(media);
      const state = window as typeof window & { __teleprompterMediaCalls?: Array<{ audio?: unknown; video?: unknown }> };
      state.__teleprompterMediaCalls = [];
      media.getUserMedia = async (constraints) => {
        state.__teleprompterMediaCalls?.push({ audio: constraints.audio, video: constraints.video });
        return original(constraints);
      };
    });
    await page.getByRole('button', { name: 'Record with teleprompter' }).click();
    await expect(page.getByRole('region', { name: 'Teleprompter reader' })).toBeVisible();
    await settlePage(page);
    mediaCalls.push(...await page.evaluate(() => (window as typeof window & { __teleprompterMediaCalls?: Array<{ audio?: unknown; video?: unknown }> }).__teleprompterMediaCalls ?? []));
    expect(mediaCalls).toEqual([]);
    expect(modelRequests).toEqual([]);
    expect(nonGets).toEqual([]);
    await expect(page.getByText('Read-only until you explicitly enable your microphone.')).toBeVisible();
  });

  test('plays and pauses the prompt while preserving the cursor through WPM and font changes', async ({ page }) => {
    await openPrompter(page, `QA prompt ${Date.now()}`, sampleScript.repeat(2));
    await choosePromptMode(page, 'Fixed pace');
    const tokens = page.locator('.tp-script-column .tp-token');
    await tokens.filter({ hasText: /^breath/ }).first().click();
    const selected = await currentPromptWord(page);
    expect(selected.toLocaleLowerCase()).toContain('breath');

    await page.getByRole('button', { name: 'Play prompt', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause prompt', exact: true })).toBeVisible();
    await page.waitForTimeout(550);
    await page.getByRole('button', { name: 'Pause prompt', exact: true }).click();
    const paused = await currentPromptWord(page);
    expect(paused).not.toBe(selected);

    const beforeSettings = await page.locator('[aria-label="Teleprompter reader"]').evaluate((element) => ({
      size: element.getAttribute('style')?.match(/--tp-size:\s*([^;]+)/)?.[1] ?? '',
      column: element.getAttribute('style')?.match(/--tp-column:\s*([^;]+)/)?.[1] ?? '',
      margin: element.getAttribute('style')?.match(/--tp-margin:\s*([^;]+)/)?.[1] ?? '',
    }));
    await setPromptSlider(page, 'Speed', 180);
    await setPromptSlider(page, 'Text size', 56);
    const afterSettings = await page.locator('[aria-label="Teleprompter reader"]').evaluate((element) => ({
      size: element.getAttribute('style')?.match(/--tp-size:\s*([^;]+)/)?.[1] ?? '',
      column: element.getAttribute('style')?.match(/--tp-column:\s*([^;]+)/)?.[1] ?? '',
      margin: element.getAttribute('style')?.match(/--tp-margin:\s*([^;]+)/)?.[1] ?? '',
    }));
    expect(afterSettings.size).not.toBe(beforeSettings.size);
    expect(await currentPromptWord(page)).toBe(paused);
    expect(await promptSliderValue(page, 'Speed')).toBe('180');
    expect(await promptSliderValue(page, 'Text size')).toBe('56');

    await choosePromptMode(page, 'Finish in');
    await expect(page.locator('.tp-script-panel .tp-settings-panel')).toContainText('FINISH IN');
    await choosePromptMode(page, 'Manual');
    await expect(page.getByRole('button', { name: 'Start manual read', exact: true })).toBeVisible();
    await saveScreenshot(page, test.info(), 'prompt-controls-desktop.png');
  });

  test('keeps the reading stage visible while customizing on portrait and landscape mobile sizes', async ({ page }) => {
    await openPrompter(page, `QA mobile ${Date.now()}`, sampleScript);
    for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 780 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await settlePage(page);
      const geometry = await page.evaluate(() => {
        const stage = document.querySelector('.tp-reading-stage')?.getBoundingClientRect();
        const settings = [...document.querySelectorAll('.tp-settings-panel, .tp-essential-settings')]
          .map((element) => ({ element, rect: element.getBoundingClientRect(), display: getComputedStyle(element).display }))
          .find(({ rect, display }) => display !== 'none' && rect.width > 0 && rect.height > 0)?.rect;
        return { stage, settings, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, dialogs: document.querySelectorAll('[role="dialog"]').length };
      });
      expect(geometry.scrollWidth, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.stage?.width ?? 0).toBeGreaterThan(0);
      expect(geometry.stage?.height ?? 0).toBeGreaterThan(0);
      expect(geometry.settings?.width ?? 0).toBeGreaterThan(0);
      expect(geometry.dialogs).toBe(0);
      await saveScreenshot(page, test.info(), `prompt-controls-${viewport.width}x${viewport.height}.png`);
    }
  });

  test('imports TXT and DOCX scripts, searches, bookmarks, backs up, and persists cursor/settings across reload', async ({ page }) => {
    await openPrompter(page, `QA import ${Date.now()}`, sampleScript);
    const importInput = page.locator('input[type="file"][accept*="docx"]');
    await importInput.setInputFiles({ name: 'imported.txt', mimeType: 'text/plain', buffer: Buffer.from('Imported text survives the local script library.') });
    await expect(page.getByRole('button', { name: /imported(\.txt)?/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /imported(\.txt)?/ }).click();
    await expect(page.locator('.tp-body-field textarea')).toHaveValue('Imported text survives the local script library.');

    await importInput.setInputFiles({ name: 'word-import.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: minimalDocx('DOCX words are extracted locally.') });
    await expect(page.getByRole('button', { name: /word-import/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /word-import/ }).click();
    await expect(page.locator('.tp-body-field textarea')).toHaveValue(/DOCX words are extracted locally\./);

    const firstWord = page.locator('.tp-script-column .tp-token').first();
    await firstWord.click();
    await page.getByRole('button', { name: 'Bookmark current word', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bookmarked start word', exact: true })).toBeVisible();
    await choosePromptMode(page, 'Manual');
    await setPromptSlider(page, 'Text size', 54);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Backup .txt', exact: true }).click();
    await expect((await download).suggestedFilename()).toMatch(/word-import\.txt$/);
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Close prompter studio', exact: true }).click();
    await page.getByRole('button', { name: 'Record with teleprompter', exact: true }).click();
    await expect(page.locator('.tp-body-field textarea')).toHaveValue(/DOCX words are extracted locally\./);
    const settingsToggle = page.locator('.tp-script-panel .tp-settings-toggle button').first();
    if ((await settingsToggle.getAttribute('aria-expanded')) !== 'true') await settingsToggle.click();
    await expect(page.locator('.tp-script-panel .tp-settings-panel .tp-mode-picker').getByRole('button', { name: 'Manual', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Bookmarked start word', exact: true })).toBeVisible();
    await expect(page.locator('.tp-script-panel .slider-field').filter({ hasText: 'Text size' }).first().locator('[role="slider"]')).toHaveAttribute('aria-valuenow', '54');
    await page.getByRole('textbox', { name: 'Search scripts', exact: true }).fill('word-import');
    await expect(page.getByRole('button', { name: /word-import/ })).toBeVisible();
  });

  test('flushes the latest word and script before immediate close and reopen', async ({ page }) => {
    const title = `QA close ${Date.now()}`;
    await openPrompter(page, title, sampleScript);
    const last = page.locator('.tp-script-column .tp-token').last();
    const lastWord = await last.innerText();
    await last.click();
    await page.getByRole('button', { name: 'Close prompter studio', exact: true }).click();
    await page.getByRole('button', { name: 'Record with teleprompter', exact: true }).click();
    await expect(page.locator('.tp-title-field input')).toHaveValue(title);
    await expect(page.locator('.tp-body-field textarea')).toHaveValue(sampleScript);
    await expect(page.locator('.tp-token[aria-current="true"]').last()).toHaveText(lastWord);
  });
});
