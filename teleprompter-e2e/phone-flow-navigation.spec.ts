import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SCRIPT = 'A clear idea deserves a calm delivery. Take a breath and keep your place while the next sentence arrives.';
const evidenceDir = resolve(process.cwd(), 'docs', 'phone-flow-evidence');

test.describe('phone first Script to Record to Review flow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens Script without media permission and moves through capture, review, retake and editor back', async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    const mediaCalls: unknown[] = [];
    await page.addInitScript(() => {
      const media = navigator.mediaDevices;
      if (!media?.getUserMedia) return;
      const state = window as typeof window & { __phoneFlowMediaCalls?: unknown[] };
      state.__phoneFlowMediaCalls = [];
      const original = media.getUserMedia.bind(media);
      media.getUserMedia = async (constraints) => {
        state.__phoneFlowMediaCalls?.push(constraints);
        return original(constraints);
      };
    });

    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Write what you want to say.', exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'before-continue-script-390x844.png'), fullPage: true });
    mediaCalls.push(...await page.evaluate(() => (window as typeof window & { __phoneFlowMediaCalls?: unknown[] }).__phoneFlowMediaCalls ?? []));
    expect(mediaCalls).toHaveLength(0);
    expect(await page.locator('.tp-reading-stage').count()).toBe(0);

    await page.getByLabel('Script text', { exact: true }).fill(SCRIPT);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.tp-record-fullscreen')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('video[aria-label="Camera preview"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => {
      const video = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
      return Boolean(video?.srcObject && video.videoWidth > 0 && video.videoHeight > 0);
    }, undefined, { timeout: 20_000 });
    mediaCalls.push(...await page.evaluate(() => (window as typeof window & { __phoneFlowMediaCalls?: unknown[] }).__phoneFlowMediaCalls ?? []));
    expect(mediaCalls.length).toBeGreaterThan(0);
    const recordGeometry = await page.evaluate(() => ({
      scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
      viewportHeight: innerHeight,
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      viewportWidth: innerWidth,
    }));
    expect(recordGeometry.scrollHeight).toBeLessThanOrEqual(recordGeometry.viewportHeight + 2);
    expect(recordGeometry.scrollWidth).toBeLessThanOrEqual(recordGeometry.viewportWidth + 2);
    await page.setViewportSize({ width: 360, height: 780 });
    const promptGeometry = await page.evaluate(() => {
      const token = document.querySelector('.tp-reader-compact .tp-token');
      const overlay = document.querySelector('.tp-record-reader-overlay');
      const video = document.querySelector('video[aria-label="Camera preview"]');
      return { tokenHeight: token?.getBoundingClientRect().height ?? 0, overlay: overlay?.getBoundingClientRect(), video: video?.getBoundingClientRect() };
    });
    expect(promptGeometry.tokenHeight).toBeGreaterThanOrEqual(40);
    expect(promptGeometry.overlay?.width ?? 0).toBeLessThanOrEqual(promptGeometry.video?.width ?? 0);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.waitForTimeout(1_200);
    await page.getByRole('button', { name: 'Stop and save recording', exact: true }).click();
    await expect(page.locator('.tp-take-review')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Retake', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep & continue', exact: true })).toBeEnabled({ timeout: 45_000 });
    await page.screenshot({ path: resolve(evidenceDir, 'after-stop-review-390x844.png'), fullPage: true });

    await page.getByRole('button', { name: 'Retake', exact: true }).click();
    await expect(page.locator('.tp-record-fullscreen')).toBeVisible();
    await page.getByRole('button', { name: 'Back to script', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.tp-record-fullscreen')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.waitForTimeout(1_200);
    await page.getByRole('button', { name: 'Stop and save recording', exact: true }).click();
    await expect(page.locator('.tp-take-review')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Keep & continue', exact: true })).toBeEnabled({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Keep & continue', exact: true }).click();
    await expect(page.locator('.editor-shell')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: resolve(evidenceDir, 'editor-cut-390x844.png'), fullPage: true });
    const firstCut = page.locator('.cut-card').first();
    await expect(firstCut.locator('.cut-stepper')).toHaveCount(2);
    for (const label of ['Keep less before', 'Keep more before', 'Keep less after', 'Keep more after']) {
      await expect(firstCut.locator(`button[aria-label="${label}"]`)).toBeVisible();
      await expect(firstCut.locator(`button[aria-label="${label}"]`)).toBeEnabled();
    }
    const cutListLayout = await firstCut.evaluate((card) => {
      const list = card.closest('.cut-list');
      const style = list ? getComputedStyle(list) : null;
      const cardRect = card.getBoundingClientRect();
      const listRect = list?.getBoundingClientRect();
      return { maxHeight: style?.maxHeight ?? '', overflow: style?.overflow ?? '', cardBottom: cardRect.bottom, listBottom: listRect?.bottom ?? 0 };
    });
    expect(cutListLayout.maxHeight).toBe('none');
    expect(cutListLayout.overflow).toBe('visible');
    expect(cutListLayout.cardBottom).toBeLessThanOrEqual(cutListLayout.listBottom + 1);
    const beforeCutAdjustment = await firstCut.locator('.cut-adjustment-value').innerText();
    await firstCut.locator('button[aria-label="Keep more before"]').click();
    await expect(firstCut.locator('.cut-adjustment-value')).not.toHaveText(beforeCutAdjustment);
    await expect(firstCut).toContainText('Adjusted');
    await firstCut.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidenceDir, 'editor-cut-adjust-390x844.png'), fullPage: false });
    const editorInitialGeometry = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      viewportWidth: innerWidth,
      dockTop: document.querySelector('.mobile-bottom-dock')?.getBoundingClientRect().top ?? innerHeight,
      timelineBottom: document.querySelector('.timeline-panel')?.getBoundingClientRect().bottom ?? 0,
    }));
    expect(editorInitialGeometry.scrollWidth).toBeLessThanOrEqual(editorInitialGeometry.viewportWidth + 2);
    await page.evaluate(() => document.scrollingElement?.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'auto' }));
    await page.waitForTimeout(100);
    const editorBottomGeometry = await page.evaluate(() => ({
      dockTop: document.querySelector('.mobile-bottom-dock')?.getBoundingClientRect().top ?? innerHeight,
      timelineBottom: document.querySelector('.timeline-panel')?.getBoundingClientRect().bottom ?? 0,
      lastCutBottom: Array.from(document.querySelectorAll('.cut-card')).at(-1)?.getBoundingClientRect().bottom ?? 0,
      scrollTop: document.scrollingElement?.scrollTop ?? 0,
      scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
      viewportHeight: innerHeight,
    }));
    expect(editorBottomGeometry.timelineBottom).toBeLessThanOrEqual(editorBottomGeometry.dockTop + 2);
    if (editorBottomGeometry.lastCutBottom) expect(editorBottomGeometry.lastCutBottom).toBeLessThanOrEqual(editorBottomGeometry.dockTop + 2);
    await page.getByRole('button', { name: 'Back', exact: true }).first().click();
    await expect(page.locator('.tp-take-review')).toBeVisible({ timeout: 20_000 });
  });

  test('keeps the Script surface within the phone viewport in landscape', async ({ page }) => {
    await page.goto('./');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      viewportWidth: innerWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 2);
    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 2);
    mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: resolve(evidenceDir, 'script-landscape-844x390.png'), fullPage: true });
  });

  test('keeps compact stepper hit areas readable at 360px and 390px', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible();
    for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => [...document.querySelectorAll('.tp-studio-header .tp-progress.origin-stepper button')].map((button) => {
        const rect = button.getBoundingClientRect();
        const indicator = button.querySelector('.origin-stepper-indicator')?.getBoundingClientRect();
        return { width: rect.width, height: rect.height, indicatorWidth: indicator?.width ?? 0, indicatorHeight: indicator?.height ?? 0 };
      }));
      expect(geometry).toHaveLength(4);
      for (const item of geometry) {
        expect(item.width).toBeGreaterThanOrEqual(44);
        expect(item.height).toBeGreaterThanOrEqual(44);
        expect(item.indicatorWidth).toBeGreaterThanOrEqual(30);
        expect(item.indicatorHeight).toBeGreaterThanOrEqual(30);
      }
    }
  });

  test('imports an existing video from Script and editor Back returns to Script', async ({ page }) => {
    await page.goto('./');
    const input = page.locator('input[aria-label="Choose another video"]');
    await input.setInputFiles(resolve(process.cwd(), 'tests', 'fixtures', 'tiny.mp4'));
    await expect(page.locator('.editor-shell')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Back', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.tp-take-review')).toHaveCount(0);
  });
});
