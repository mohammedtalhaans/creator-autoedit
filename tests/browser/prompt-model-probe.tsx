import { createRoot } from 'react-dom/client';
import { LocalVoiceController } from '../../src/features/teleprompter/localVoice';
import { LocalWritingController } from '../../src/features/teleprompter/localWriting';
import { PromptMatcher } from '../../src/features/teleprompter/matcher';
import { parsePrompt } from '../../src/features/teleprompter/text';

const MOONSHINE_MODEL = 'onnx-community/moonshine-tiny-ONNX';
const MOONSHINE_REVISION = 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95';
const SMOLLM_MODEL = 'onnx-community/SmolLM2-135M-Instruct-ONNX';
const SMOLLM_REVISION = 'b8a5c0f183b78c55955a5364f610c36668b5e681';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadFixtureAudio(): Promise<{ context: AudioContext; buffer: AudioBuffer }> {
  const response = await fetch(new URL('../fixtures/tiny.mp4', import.meta.url));
  if (!response.ok) throw new Error(`Speech fixture returned HTTP ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error('Web Audio is unavailable in this browser.');
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(bytes);
    await context.resume();
    return { context, buffer };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw new Error(`Fixture audio could not be decoded by Web Audio: ${errorText(error)}`);
  }
}

async function runVoiceProbe() {
  const parsed = parsePrompt('Your best ideas deserve to be heard.');
  const matcher = new PromptMatcher(parsed.spokenTokens, 0);
  const voice = new LocalVoiceController();
  const statuses: Array<{ status: string; detail?: string }> = [];
  const transcripts: Array<{ text: string; isFinal: boolean; epoch: number }> = [];
  const matches: Array<{ text: string; start: number; end: number; score: number; epoch: number }> = [];
  const publishState = (patch: Partial<PromptModelVoiceState>) => {
    window.promptModelVoiceState = {
      ...(window.promptModelVoiceState ?? {}),
      ...patch,
      statuses: statuses.slice(-24),
      transcripts: transcripts.slice(-24),
      matcherCursor: matcher.getState().cursor,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  };
  let activeEpoch = 1;
  let staleIgnored = 0;
  const callbacksFor = (epoch: number) => ({
    onStatus: (status: string, detail?: string) => {
      statuses.push({ status, detail });
      publishState({ phase: status, detail });
    },
    onTranscript: (text: string, isFinal: boolean) => {
      if (epoch !== activeEpoch) {
        staleIgnored++;
        return;
      }
      transcripts.push({ text, isFinal, epoch });
      publishState({ phase: 'transcript' });
      const match = matcher.process(text, isFinal);
      if (match) matches.push({ text, start: match.start, end: match.end, score: match.score, epoch });
    },
    onLevel: () => undefined,
  });
  let audio: { context: AudioContext; buffer: AudioBuffer } | null = null;
  let source: AudioBufferSourceNode | null = null;
  const startedAt = performance.now();
  publishState({ phase: 'created' });
  try {
    publishState({ phase: 'preparing-workers' });
    await voice.prepare(callbacksFor(activeEpoch));
    publishState({ phase: 'decoding-fixture' });
    audio = await loadFixtureAudio();
    // Deliberately keep fixture playback off speakers: the only destination is
    // the stream consumed by LocalVoiceController.start().
    const destination = audio.context.createMediaStreamDestination();
    source = audio.context.createBufferSource();
    source.buffer = audio.buffer;
    source.connect(destination);
    publishState({ phase: 'starting-audio-graph' });
    await voice.start(destination.stream, callbacksFor(activeEpoch));
    source.start();
    publishState({ phase: 'playing-fixture' });

    // Exercise independent pause/resume without stopping the fixture source.
    await sleep(2_400);
    voice.pause();
    const paused = voice.getStatus() === 'paused';
    await sleep(260);
    voice.resume();
    const resumed = voice.getStatus() === 'listening';
    // Moonshine receives a complete fixture segment after the voice activity
    // grace period. Give the worker time to return actual text, not a canned
    // transcript, before stopping the session.
    const deadline = performance.now() + 45_000;
    while (!transcripts.join(' ').match(/\bbest\b/i) || !transcripts.join(' ').match(/\bideas\b/i)) {
      if (performance.now() >= deadline) break;
      await sleep(200);
    }
    await voice.stop();
    publishState({ phase: 'stopped-first-session' });
    source.stop();
    source = null;

    const firstSessionCursor = matcher.getState().cursor;
    const firstSessionTranscript = transcripts.map((item) => item.text).join(' ');
    if (!/\bbest\b/i.test(firstSessionTranscript) || !/\bideas\b/i.test(firstSessionTranscript)) {
      throw new Error(`Local voice produced no expected fixture phrase. Actual transcript: ${firstSessionTranscript || '(empty)'}`);
    }
    if (firstSessionCursor <= 0 || !matches.some((match) => match.end > 0))
      throw new Error(`Script matcher did not advance from the real transcript (cursor ${firstSessionCursor}).`);

    // An old callback arriving after a manual jump must be ignored by the
    // session epoch guard. The text below was returned by the real worker.
    const staleCallback = callbacksFor(activeEpoch).onTranscript;
    matcher.seek(4);
    const jumpedCursor = matcher.getState().cursor;
    activeEpoch++;
    staleCallback(firstSessionTranscript, true);
    const staleCursor = matcher.getState().cursor;
    if (staleCursor !== jumpedCursor) throw new Error('A stale voice callback moved the manually selected script cursor.');

    // Stop terminates the worker generation; start again proves the controller
    // can create a fresh local session. The second run is intentionally short.
    await voice.prepare(callbacksFor(activeEpoch));
    publishState({ phase: 'preparing-restart' });
    const secondDestination = audio.context.createMediaStreamDestination();
    const secondSource = audio.context.createBufferSource();
    secondSource.buffer = audio.buffer;
    secondSource.connect(secondDestination);
    await voice.start(secondDestination.stream, callbacksFor(activeEpoch));
    secondSource.start();
    publishState({ phase: 'playing-restart' });
    await sleep(450);
    await voice.stop();
    secondSource.stop();

    return {
      model: MOONSHINE_MODEL,
      revision: MOONSHINE_REVISION,
      runtime: 'Transformers.js 3.7.2 via Silero VAD + AudioWorklet + Moonshine worker',
      route: 'AudioBufferSourceNode -> AudioContext.createMediaStreamDestination -> LocalVoiceController.start(stream); no speakers',
      elapsedMs: Math.round(performance.now() - startedAt),
      statuses,
      transcripts,
      recognizedText: firstSessionTranscript,
      matches,
      cursorBefore: 0,
      cursorAfterRealSpeech: firstSessionCursor,
      manualJumpCursor: jumpedCursor,
      staleCursor,
      staleIgnored,
      paused,
      resumed,
      restarted: statuses.filter((item) => item.status === 'listening').length >= 2,
    };
  } catch (error) {
    publishState({ phase: 'failed', error: errorText(error) });
    throw new Error(`LOCAL_VOICE_E2E src/features/teleprompter/localVoice.ts: ${errorText(error)}`);
  } finally {
    try { source?.stop(); } catch { /* the fixture may have ended naturally */ }
    await voice.stop().catch(() => undefined);
    if (audio) await audio.context.close().catch(() => undefined);
  }
}

async function runWritingProbe() {
  const controller = new LocalWritingController();
  const source = 'Write a short opening about recording a clear tutorial.';
  const startedAt = performance.now();
  try {
    await controller.prepare();
    const draft = await controller.generate(source, {
      instruction: 'Write a short opening about recording a clear tutorial. Return only the opening.',
      maxNewTokens: 96,
      timeoutMs: 180_000,
    });
    const rewritten = await controller.generate(draft || source, {
      instruction: 'Rewrite this opening so it sounds concise and natural when spoken aloud. Return only the rewrite.',
      maxNewTokens: 96,
      timeoutMs: 180_000,
    });
    const cancelPromise = controller.generate(source, { maxNewTokens: 96, timeoutMs: 180_000 });
    await sleep(0);
    controller.cancel();
    let cancelled = false;
    try {
      await cancelPromise;
    } catch {
      cancelled = true;
    }
    if (draft.trim().split(/\s+/).length < 4) throw new Error(`Generated draft was too short: ${draft}`);
    if (!rewritten.trim() || rewritten.trim() === draft.trim()) throw new Error('Rewrite did not return distinct nonempty text.');
    if (!cancelled) throw new Error('Cancellation did not reject the in-flight local generation.');
    return {
      model: SMOLLM_MODEL,
      revision: SMOLLM_REVISION,
      runtime: 'Transformers.js 3.7.2 via prompt-ai.worker.ts',
      elapsedMs: Math.round(performance.now() - startedAt),
      source,
      draft,
      rewrite: rewritten,
      structuredResultValid: true,
      applied: false,
      cancelled,
    };
  } catch (error) {
    throw new Error(`PROMPT_AI_E2E src/workers/prompt-ai.worker.ts: ${errorText(error)}`);
  } finally {
    controller.dispose();
  }
}

declare global {
  interface Window {
    promptModelVoiceState?: PromptModelVoiceState;
    promptModelProbe: {
      voice: typeof runVoiceProbe;
      writing: typeof runWritingProbe;
    };
  }
}

interface PromptModelVoiceState {
  phase?: string;
  detail?: string;
  error?: string;
  statuses?: Array<{ status: string; detail?: string }>;
  transcripts?: Array<{ text: string; isFinal: boolean; epoch: number }>;
  matcherCursor?: number;
  elapsedMs?: number;
}

window.promptModelProbe = { voice: runVoiceProbe, writing: runWritingProbe };
createRoot(document.getElementById('root')!).render(<p>Opt-in local model probe ready.</p>);
