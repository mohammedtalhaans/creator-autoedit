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
    await page.waitForFunction(() => Boolean(document.querySelector('canvas[aria-label="Camera preview image"]')?.getAttribute('data-content-rect')));
    const cameraFrame = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[aria-label="Camera preview image"]') as HTMLCanvasElement | null;
      const content = canvas?.getAttribute('data-content-rect');
      return { rect: canvas?.getBoundingClientRect(), targetWidth: canvas?.width ?? 0, targetHeight: canvas?.height ?? 0, framingMode: canvas?.dataset.framingMode ?? '', rotation: canvas?.dataset.rotation ?? '', content: content ? JSON.parse(content) as { x: number; y: number; width: number; height: number } : null };
    });
    expect(cameraFrame.framingMode).toBe('fill');
    expect(cameraFrame.rotation).toBe('0');
    expect(cameraFrame.rect?.width ?? 0).toBeGreaterThan(0);
    expect(cameraFrame.rect?.height ?? 0).toBeGreaterThan(0);
    expect(cameraFrame.content?.x ?? 1).toBeLessThanOrEqual(1);
    expect(cameraFrame.content?.y ?? 1).toBeLessThanOrEqual(1);
    expect((cameraFrame.content?.x ?? 0) + (cameraFrame.content?.width ?? 0)).toBeGreaterThanOrEqual(cameraFrame.targetWidth - 1);
    expect((cameraFrame.content?.y ?? 0) + (cameraFrame.content?.height ?? 0)).toBeGreaterThanOrEqual(cameraFrame.targetHeight - 1);
    mediaCalls.push(...await page.evaluate(() => (window as typeof window & { __phoneFlowMediaCalls?: unknown[] }).__phoneFlowMediaCalls ?? []));
    expect(mediaCalls.length).toBeGreaterThan(0);
    const requestedVideo = (mediaCalls[0] as { video?: { width?: { ideal?: number }; height?: { ideal?: number }; resizeMode?: { ideal?: string }; aspectRatio?: unknown } }).video;
    expect(requestedVideo?.width?.ideal).toBeGreaterThan(requestedVideo?.height?.ideal ?? Number.POSITIVE_INFINITY);
    expect(requestedVideo?.resizeMode?.ideal).toBe('none');
    expect(requestedVideo?.aspectRatio).toBeUndefined();
    const promptScroll = page.locator('.tp-reader-compact .tp-script-scroll');
    const promptWords = page.locator('.tp-reader-compact button[data-spoken-index]');
    await expect(page.getByText('Scroll · tap a word', { exact: true })).toBeVisible();
    await expect(promptWords).toHaveCount(19);
    expect(await promptScroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const jumpWord = promptWords.nth(9);
    await jumpWord.scrollIntoViewIfNeeded();
    await jumpWord.click();
    await expect(jumpWord).toHaveAttribute('aria-current', 'true');
    await promptWords.first().scrollIntoViewIfNeeded();
    await promptWords.first().click();
    await expect(promptWords.first()).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.tp-screen-light')).toBeVisible();
    await page.getByRole('button', { name: 'Open front flash controls', exact: true }).click();
    const lightDialog = page.getByRole('dialog', { name: 'Screen light controls', exact: true });
    await expect(lightDialog).toBeVisible();
    await expect(lightDialog.getByRole('button', { name: 'Neutral screen light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await lightDialog.getByRole('button', { name: 'Warm screen light', exact: true }).click();
    await expect(lightDialog.getByRole('button', { name: 'Warm screen light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(lightDialog.getByRole('slider', { name: 'Intensity', exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'record-front-flash-controls-390x844.png'), fullPage: false });
    await lightDialog.getByRole('switch', { name: 'Ring light', exact: true }).click();
    await expect(page.locator('.tp-screen-light')).toHaveCount(0);
    await lightDialog.getByRole('switch', { name: 'Ring light', exact: true }).click();
    await expect(page.locator('.tp-screen-light')).toBeVisible();
    await lightDialog.getByRole('button', { name: 'Close screen light controls', exact: true }).click();
    const initialPromptSize = await page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => stage.style.getPropertyValue('--tp-size'));
    await page.getByRole('button', { name: 'Make transcript larger', exact: true }).click();
    await expect.poll(() => page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => stage.style.getPropertyValue('--tp-size'))).not.toBe(initialPromptSize);
    await page.getByRole('button', { name: 'Hide transcript', exact: true }).click();
    await expect(page.locator('.tp-reader-compact')).toHaveClass(/tp-reader-hidden/);
    await page.getByRole('button', { name: 'Show transcript', exact: true }).click();
    await expect(page.locator('.tp-reader-compact')).not.toHaveClass(/tp-reader-hidden/);
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
      const video = document.querySelector('canvas[aria-label="Camera preview image"]');
      return { tokenHeight: token?.getBoundingClientRect().height ?? 0, overlay: overlay?.getBoundingClientRect(), video: video?.getBoundingClientRect() };
    });
    expect(promptGeometry.tokenHeight).toBeGreaterThanOrEqual(40);
    expect(promptGeometry.overlay?.width ?? 0).toBeLessThanOrEqual(promptGeometry.video?.width ?? 0);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.screenshot({ path: resolve(evidenceDir, 'record-fov-390x844.png'), fullPage: false });
    await page.screenshot({ path: resolve(evidenceDir, 'record-normal-view.png'), fullPage: false });
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop and save recording', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause prompt', exact: true })).toBeVisible();
    await promptScroll.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect(page.getByRole('button', { name: 'Play prompt', exact: true })).toBeVisible();
    await jumpWord.scrollIntoViewIfNeeded();
    await jumpWord.click();
    await expect(jumpWord).toHaveAttribute('aria-current', 'true');
    await page.waitForTimeout(300);
    const captureBeforePromptEdit = await page.evaluate(() => {
      const video = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
      const stage = document.querySelector('.tp-reader-compact .tp-reading-stage') as HTMLElement | null;
      return { trackId: video?.srcObject?.getVideoTracks()[0]?.id ?? '', elapsed: document.querySelector('.tp-record-timer')?.textContent ?? '', size: stage ? getComputedStyle(stage).getPropertyValue('--tp-size').trim() : '' };
    });
    await page.getByRole('button', { name: 'Open prompt controls', exact: true }).click();
    const promptDialog = page.getByRole('dialog', { name: 'Prompt controls', exact: true });
    await expect(promptDialog).toBeVisible();
    for (const label of ['Speed', 'Text size', 'Reading line', 'Prompt window', 'Vertical position', 'Column width', 'Horizontal position', 'Line height', 'Background opacity', 'Background blur']) await expect(promptDialog.getByRole('slider', { name: label, exact: true })).toBeVisible();
    await expect(promptDialog.getByText('Text alignment', { exact: true })).toBeVisible();
    await expect(promptDialog.getByRole('switch', { name: 'Dim surrounding text', exact: true })).toBeVisible();
    await expect(promptDialog.getByRole('switch', { name: 'Show transcript', exact: true })).toBeVisible();
    await expect(promptDialog.getByRole('switch', { name: 'Show background', exact: true })).toBeVisible();
    await expect(promptDialog.getByRole('switch', { name: 'Text shadow', exact: true })).toBeVisible();
    await expect(promptDialog.getByRole('switch', { name: 'Text outline', exact: true })).toBeVisible();
    await expect(promptDialog.getByRole('switch', { name: 'Show reading line', exact: true })).toBeVisible();
    const promptGeometryBefore = await page.evaluate(() => {
      const stage = document.querySelector('.tp-reader-compact .tp-reading-stage') as HTMLElement | null;
      const column = document.querySelector('.tp-reader-compact .tp-script-column') as HTMLElement | null;
      if (!stage || !column) return null;
      const stageStyle = getComputedStyle(stage);
      const columnRect = column.getBoundingClientRect();
      return { height: stageStyle.height, background: stageStyle.backgroundColor, width: columnRect.width, left: columnRect.left, line: document.querySelectorAll('.tp-reader-compact .tp-reading-line').length };
    });
    await promptDialog.getByRole('slider', { name: 'Text size', exact: true }).press('ArrowRight');
    await expect.poll(() => page.evaluate(() => (document.querySelector('.tp-reader-compact .tp-reading-stage') as HTMLElement | null)?.style.getPropertyValue('--tp-size').trim() ?? '')).not.toBe(captureBeforePromptEdit.size);
    await promptDialog.getByRole('slider', { name: 'Background opacity', exact: true }).press('ArrowRight');
    await promptDialog.getByRole('slider', { name: 'Prompt window', exact: true }).press('ArrowRight');
    await promptDialog.getByRole('slider', { name: 'Column width', exact: true }).press('ArrowRight');
    await promptDialog.getByRole('slider', { name: 'Horizontal position', exact: true }).press('ArrowRight');
    const topBefore = await page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => stage.style.getPropertyValue('--tp-window-top'));
    await promptDialog.getByRole('button', { name: 'Middle', exact: true }).click();
    await expect.poll(() => page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => stage.style.getPropertyValue('--tp-window-top'))).not.toBe(topBefore);
    await promptDialog.getByRole('combobox', { name: 'Font', exact: true }).selectOption({ label: 'Georgia' });
    await expect.poll(() => page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => getComputedStyle(stage).fontFamily)).toContain('Georgia');
    await promptDialog.getByRole('switch', { name: 'Show background', exact: true }).click();
    await expect.poll(() => page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => getComputedStyle(stage).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await promptDialog.getByRole('switch', { name: 'Text outline', exact: true }).click();
    await expect.poll(() => page.locator('.tp-reader-compact .tp-reading-stage').evaluate((stage) => getComputedStyle(stage).webkitTextStrokeWidth)).toBe('1px');
    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector('.tp-reader-compact .tp-reading-stage') as HTMLElement | null;
      const column = document.querySelector('.tp-reader-compact .tp-script-column') as HTMLElement | null;
      if (!stage || !column) return null;
      const columnRect = column.getBoundingClientRect();
      return { height: getComputedStyle(stage).height, background: getComputedStyle(stage).backgroundColor, width: columnRect.width, left: columnRect.left };
    })).not.toEqual(promptGeometryBefore && { height: promptGeometryBefore.height, background: promptGeometryBefore.background, width: promptGeometryBefore.width, left: promptGeometryBefore.left });
    await promptDialog.getByRole('button', { name: 'Center', exact: true }).click();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.tp-reader-compact .tp-script-column') as HTMLElement).textAlign)).toBe('center');
    await promptDialog.getByRole('button', { name: 'Left', exact: true }).click();
    await promptDialog.getByRole('switch', { name: 'Show reading line', exact: true }).click();
    await expect(page.locator('.tp-reader-compact .tp-reading-line')).toHaveCount(0);
    await page.waitForTimeout(1_200);
    const captureAfterPromptEdit = await page.evaluate(() => {
      const video = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
      return { trackId: video?.srcObject?.getVideoTracks()[0]?.id ?? '', elapsed: document.querySelector('.tp-record-timer')?.textContent ?? '' };
    });
    expect(captureAfterPromptEdit.trackId).toBe(captureBeforePromptEdit.trackId);
    expect(captureAfterPromptEdit.elapsed).toMatch(/^\d+:\d\d$/);
    await expect(page.getByRole('button', { name: 'Stop and save recording', exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'record-prompt-controls-390x844.png'), fullPage: false });
    await page.screenshot({ path: resolve(evidenceDir, 'record-prompt-controls.png'), fullPage: false });
    await promptDialog.getByRole('button', { name: 'Close prompt controls', exact: true }).click();
    await expect(promptDialog).toBeHidden();
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
    const cutCards = page.locator('.cut-card');
    const cutCount = await cutCards.count();
    let usableCutIndex = -1;
    for (let index = 0; index < cutCount; index += 1) {
      const value = await cutCards.nth(index).locator('.cut-adjustment-value').innerText();
      if (value !== '00:00.00') { usableCutIndex = index; break; }
    }
    expect(usableCutIndex).toBeGreaterThanOrEqual(0);
    const firstCut = cutCards.nth(usableCutIndex);
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
