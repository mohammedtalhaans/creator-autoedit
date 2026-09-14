import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {} from '../tests/browser/prompt-model-probe';

const enabled = process.env.ENABLE_PROMPT_MODEL_E2E === '1';

test.describe('opt-in local teleprompter models', () => {
  test.skip(!enabled, 'Set ENABLE_PROMPT_MODEL_E2E=1 and use playwright.prompt-model.config.ts to download/run local models.');
  test.setTimeout(15 * 60_000);

  test('runs real local voice follow through AudioWorklet, VAD, Moonshine, and ScriptMatcher', async ({ page }, info) => {
    const failures: string[] = [];
    const diagnostics: string[] = [];
    const startedAt = Date.now();
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('crash', () => diagnostics.push('page crashed'));
    page.on('close', () => diagnostics.push('page closed'));
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) diagnostics.push(`navigated ${frame.url()}`); });
    page.on('requestfailed', (request) => diagnostics.push(`request failed ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));
    page.on('console', (message) => {
      if (/onnx|model|worker|speech|moonshine|silero|audio/i.test(message.text())) diagnostics.push(`${message.type()}: ${message.text().slice(0, 2_000)}`);
    });
    await page.goto('tests/browser/prompt-model-probe.html');
    await page.getByText('Opt-in local model probe ready.').click();
    await page.waitForFunction(() => !!window.promptModelProbe);
    let result: Awaited<ReturnType<typeof window.promptModelProbe.voice>>;
    try {
      result = await page.evaluate(() => window.promptModelProbe.voice());
    } catch (error) {
      const state = await page.evaluate(() => window.promptModelVoiceState ?? null).catch(() => null);
      const evidence = {
        status: 'failed',
        model: 'onnx-community/moonshine-tiny-ONNX',
        revision: 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95',
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        pageErrors: failures,
        diagnostics: diagnostics.slice(0, 24),
        state,
      };
      await info.attach('model-voice-failure-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
      const evidenceDir = resolve('docs/teleprompter-evidence');
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(resolve(evidenceDir, 'model-voice.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      throw new Error(`LOCAL_VOICE_E2E browser failure: ${error instanceof Error ? error.message : String(error)}; page errors: ${failures.join(' | ') || '(none)'}; diagnostics: ${diagnostics.slice(0, 4).join(' | ') || '(none)'}`);
    }
    expect(result.recognizedText.toLowerCase()).toMatch(/best/);
    expect(result.recognizedText.toLowerCase()).toMatch(/ideas/);
    expect(result.cursorAfterRealSpeech).toBeGreaterThan(0);
    expect(result.paused).toBe(true);
    expect(result.resumed).toBe(true);
    expect(result.restarted).toBe(true);
    expect(result.staleIgnored).toBeGreaterThan(0);
    expect(result.staleCursor).toBe(result.manualJumpCursor);
    expect(result.route).toContain('createMediaStreamDestination');
    await info.attach('model-voice-evidence', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    const evidenceDir = resolve('docs/teleprompter-evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(resolve(evidenceDir, 'model-voice.json'), `${JSON.stringify(result, null, 2)}\n`);
  });

  test('runs real SmolLM generation, rewrite, and cancellation without applying text', async ({ page }, info) => {
    const failures: string[] = [];
    const diagnostics: string[] = [];
    const startedAt = Date.now();
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('crash', () => diagnostics.push('page crashed'));
    page.on('close', () => diagnostics.push('page closed'));
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) diagnostics.push(`navigated ${frame.url()}`); });
    page.on('requestfailed', (request) => diagnostics.push(`request failed ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));
    page.on('console', (message) => {
      if (/onnx|model|worker|smollm|writing|generation/i.test(message.text())) diagnostics.push(`${message.type()}: ${message.text().slice(0, 2_000)}`);
    });
    await page.goto('tests/browser/prompt-model-probe.html');
    await page.getByText('Opt-in local model probe ready.').click();
    await page.waitForFunction(() => !!window.promptModelProbe);
    let result: Awaited<ReturnType<typeof window.promptModelProbe.writing>>;
    try {
      result = await page.evaluate(() => window.promptModelProbe.writing());
    } catch (error) {
      const evidence = {
        status: 'failed',
        model: 'onnx-community/SmolLM2-135M-Instruct-ONNX',
        revision: 'b8a5c0f183b78c55955a5364f610c36668b5e681',
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        pageErrors: failures,
        diagnostics: diagnostics.slice(0, 24),
      };
      await info.attach('model-writing-failure-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
      const evidenceDir = resolve('docs/teleprompter-evidence');
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(resolve(evidenceDir, 'model-writing.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      throw new Error(`PROMPT_AI_E2E browser failure: ${error instanceof Error ? error.message : String(error)}; page errors: ${failures.join(' | ') || '(none)'}; diagnostics: ${diagnostics.slice(0, 4).join(' | ') || '(none)'}`);
    }
    expect(result.draft.trim().split(/\s+/).length).toBeGreaterThanOrEqual(4);
    expect(result.rewrite.trim().length).toBeGreaterThan(0);
    expect(result.rewrite.trim()).not.toBe(result.draft.trim());
    expect(result.structuredResultValid).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.cancelled).toBe(true);
    await info.attach('model-writing-evidence', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    const evidenceDir = resolve('docs/teleprompter-evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(resolve(evidenceDir, 'model-writing.json'), `${JSON.stringify(result, null, 2)}\n`);
  });
});
