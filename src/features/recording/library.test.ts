import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ScriptDocument } from '../../types/recording';
import { defaultPromptSettings, defaultCaptureSettings } from './defaults';
import { recordingDb } from './db';
import {
  appendTakeChunk,
  createRecordingTake,
  deleteScript,
  getCaptureSettings,
  getTake,
  getTakeBlob,
  listTakes,
  recoverInterrupted,
  recordingLibrary,
  saveCaptureSettings,
  saveScript,
  updateTake,
} from './library';

const script: ScriptDocument = {
  id: 'script-1',
  title: 'Test script',
  text: 'One two three',
  createdAt: 1,
  updatedAt: 1,
  cursor: 0,
  bookmarks: [],
  settings: defaultPromptSettings,
};

beforeEach(async () => {
  await recordingDb.delete();
  await recordingDb.open();
});

afterAll(async () => {
  await recordingDb.delete();
});

describe('recordingLibrary durable transactions', () => {
  it('persists scripts, ordered chunks, and survives a database reopen', async () => {
    const savedScript = await saveScript(script);
    const take = await createRecordingTake({
      script: savedScript,
      settings: defaultCaptureSettings,
      startWord: 0,
      mimeType: 'video/webm',
      actualSettings: { video: { width: 1280 }, audio: { sampleRate: 48_000 } },
      writerSessionId: 'test-writer',
    });
    await appendTakeChunk(take.id, 0, new Blob(['first'], { type: 'video/webm' }));
    await appendTakeChunk(take.id, 1, new Blob(['second'], { type: 'video/webm' }));

    expect((await getTakeBlob(take.id)).size).toBe(11);
    expect((await getTake(take.id))?.chunks).toBe(2);
    expect((await getTake(take.id))?.bytes).toBe(11);

    recordingDb.close();
    await recordingDb.open();
    expect((await recordingLibrary.listScripts())[0]?.id).toBe('script-1');
    expect(await (await getTakeBlob(take.id)).text()).toBe('firstsecond');
  });

  it('keeps takes when a script is deleted and only changes allowed metadata', async () => {
    const savedScript = await saveScript(script);
    const take = await createRecordingTake({ script: savedScript, settings: defaultCaptureSettings, startWord: 1, mimeType: 'video/webm', actualSettings: {} });
    await appendTakeChunk(take.id, 0, new Blob(['media'], { type: 'video/webm' }));
    await updateTake(take.id, { starred: true, title: 'Favourite take' });
    await deleteScript(savedScript.id);

    expect(await recordingLibrary.listScripts()).toHaveLength(0);
    expect((await getTake(take.id))?.starred).toBe(true);
    await expect(updateTake(take.id, { bytes: 999 } as never)).rejects.toThrow(/immutable/);
  });

  it('recovers stale manifests without stealing a live writer lease', async () => {
    const savedScript = await saveScript(script);
    const oldTake = await createRecordingTake({ script: savedScript, settings: defaultCaptureSettings, startWord: 0, mimeType: 'video/webm', actualSettings: {}, writerSessionId: 'old' });
    await appendTakeChunk(oldTake.id, 0, new Blob(['partial'], { type: 'video/webm' }));
    await recordingDb.takes.update(oldTake.id, { lastHeartbeat: Date.now() - 60_000 });
    const liveTake = await createRecordingTake({ script: savedScript, settings: defaultCaptureSettings, startWord: 2, mimeType: 'video/webm', actualSettings: {}, writerSessionId: 'live' });

    const recovered = await recoverInterrupted();
    expect(recovered.map((take) => take.id)).toEqual([oldTake.id]);
    expect((await getTake(oldTake.id))?.status).toBe('interrupted');
    expect((await getTake(oldTake.id))?.playable).toBe(false);
    expect((await getTake(liveTake.id))?.status).toBe('recording');
  });

  it('round-trips capture settings without sharing mutable control objects', async () => {
    const settings = { ...defaultCaptureSettings, controls: { zoom: 1.5 } };
    await saveCaptureSettings(settings);
    settings.controls.zoom = 9;
    const loaded = await getCaptureSettings();
    expect(loaded.controls.zoom).toBe(1.5);
  });

  it('lists takes newest first for a script', async () => {
    const savedScript = await saveScript(script);
    const first = await createRecordingTake({ script: savedScript, settings: defaultCaptureSettings, startWord: 0, mimeType: 'video/webm', actualSettings: {} });
    const second = await createRecordingTake({ script: savedScript, settings: defaultCaptureSettings, startWord: 2, mimeType: 'video/webm', actualSettings: {} });
    await recordingDb.takes.update(first.id, { createdAt: 10 });
    await recordingDb.takes.update(second.id, { createdAt: 20 });
    expect((await listTakes(savedScript.id)).map((take) => take.id)).toEqual([second.id, first.id]);
  });
});

