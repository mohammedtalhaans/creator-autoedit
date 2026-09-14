import type {
  CaptureSettings,
  RecordingLibrary,
  ScriptDocument,
  TakePatch,
  TakeRecord,
} from '../../types/recording';
import { cloneCaptureSettings, clonePromptSettings, defaultCaptureSettings } from './defaults';
import { recordingDb, type TakeChunk } from './db';

const CAPTURE_SETTINGS_KEY = 'capture' as const;

function makeId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  return randomUuid ? randomUuid.call(globalThis.crypto) : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneScript(doc: ScriptDocument): ScriptDocument {
  return {
    ...structuredClone(doc),
    id: doc.id || makeId('script'),
    title: String(doc.title ?? '').trim() || 'Untitled script',
    text: String(doc.text ?? ''),
    createdAt: Number.isFinite(doc.createdAt) ? doc.createdAt : Date.now(),
    updatedAt: Number.isFinite(doc.updatedAt) ? doc.updatedAt : Date.now(),
    cursor: Math.max(0, Number.isFinite(doc.cursor) ? Math.floor(doc.cursor) : 0),
    bookmarks: Array.isArray(doc.bookmarks) ? doc.bookmarks.filter(Number.isFinite).map(Math.floor) : [],
    settings: clonePromptSettings(doc.settings),
  };
}

function cloneTake(take: TakeRecord): TakeRecord {
  return {
    ...structuredClone(take),
    scriptSnapshot: cloneScript(take.scriptSnapshot),
    settings: cloneCaptureSettings(take.settings),
    actualSettings: structuredClone(take.actualSettings ?? {}),
  };
}

function compareNewest(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }): number {
  return b.createdAt - a.createdAt || b.id.localeCompare(a.id);
}

/** Return chunks in their persisted sequence order, never by arrival order. */
async function readChunks(takeId: string): Promise<TakeChunk[]> {
  const chunks = await recordingDb.chunks.where('takeId').equals(takeId).sortBy('sequence');
  return chunks;
}

export async function listScripts(): Promise<ScriptDocument[]> {
  const scripts = await recordingDb.scripts.toArray();
  return scripts
    .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .map(cloneScript);
}

export async function saveScript(doc: ScriptDocument): Promise<ScriptDocument> {
  const existing = doc.id ? await recordingDb.scripts.get(doc.id) : undefined;
  const now = Date.now();
  const next = cloneScript({
    ...doc,
    id: doc.id || makeId('script'),
    createdAt: existing?.createdAt ?? doc.createdAt ?? now,
    updatedAt: now,
  });
  await recordingDb.scripts.put(next);
  return cloneScript(next);
}

export async function deleteScript(id: string): Promise<void> {
  // Scripts and takes are intentionally separate. Deleting a script never
  // removes the original recordings associated with it.
  await recordingDb.scripts.delete(id);
}

export async function listTakes(scriptId?: string): Promise<TakeRecord[]> {
  const takes = scriptId
    ? await recordingDb.takes.where('scriptId').equals(scriptId).toArray()
    : await recordingDb.takes.toArray();
  return takes.sort(compareNewest).map(cloneTake);
}

export async function getTake(id: string): Promise<TakeRecord | undefined> {
  const take = await recordingDb.takes.get(id);
  return take ? cloneTake(take) : undefined;
}

const mutableTakeKeys = new Set<keyof TakePatch>([
  'title', 'starred', 'startWord', 'endWord', 'scriptSnapshot', 'settings', 'actualSettings', 'error',
]);

export async function updateTake(id: string, patch: TakePatch): Promise<TakeRecord | undefined> {
  const invalid = Object.keys(patch).filter((key) => !mutableTakeKeys.has(key as keyof TakePatch));
  if (invalid.length > 0)
    throw new Error(`A take's media is immutable; cannot update ${invalid.join(', ')}.`);

  let updated: TakeRecord | undefined;
  await recordingDb.transaction('rw', recordingDb.takes, async () => {
    const current = await recordingDb.takes.get(id);
    if (!current) return;
    const changes: Partial<TakeRecord> = { ...patch };
    if (patch.scriptSnapshot) changes.scriptSnapshot = cloneScript(patch.scriptSnapshot);
    if (patch.settings) changes.settings = cloneCaptureSettings(patch.settings);
    if (patch.actualSettings) changes.actualSettings = structuredClone(patch.actualSettings);
    await recordingDb.takes.update(id, changes);
    const next = await recordingDb.takes.get(id);
    if (next) updated = cloneTake(next);
  });
  return updated;
}

export async function getTakeBlob(id: string): Promise<Blob> {
  const take = await recordingDb.takes.get(id);
  if (!take) throw new Error('Take not found.');
  const chunks = await readChunks(id);
  const expected = Array.from({ length: chunks.length }, (_, index) => index);
  const actual = chunks.map((chunk) => chunk.sequence);
  if (actual.some((sequence, index) => sequence !== expected[index]))
    throw new Error('This take has missing media chunks and cannot be assembled safely.');
  return new Blob(chunks.map((chunk) => chunk.blob), { type: take.mimeType || 'application/octet-stream' });
}

export async function deleteTake(id: string): Promise<void> {
  await recordingDb.transaction('rw', recordingDb.takes, recordingDb.chunks, async () => {
    await recordingDb.chunks.where('takeId').equals(id).delete();
    await recordingDb.takes.delete(id);
  });
}

export async function getCaptureSettings(): Promise<CaptureSettings> {
  const row = await recordingDb.settings.get(CAPTURE_SETTINGS_KEY);
  if (!row) {
    const settings = cloneCaptureSettings(defaultCaptureSettings);
    await saveCaptureSettings(settings);
    return settings;
  }
  return cloneCaptureSettings(row.value);
}

export async function saveCaptureSettings(settings: CaptureSettings): Promise<void> {
  const next = cloneCaptureSettings(settings);
  await recordingDb.settings.put({ key: CAPTURE_SETTINGS_KEY, value: next, updatedAt: Date.now() });
}

export interface RecordingValidation {
  playable: boolean;
  duration: number;
  error?: string;
  validatedAt?: number;
}

/**
 * Check the actual encoded container and decode capability before marking a
 * take complete. In non-DOM unit tests validation cannot run; callers receive
 * an explicit unverified result rather than a false browser playback claim.
 */
export async function validateRecordingBlob(blob: Blob, mimeType: string): Promise<RecordingValidation> {
  if (!mimeType.startsWith('video/'))
    return { playable: false, duration: 0, error: 'The recorder returned a non-video MIME type.' };
  if (blob.size === 0)
    return { playable: false, duration: 0, error: 'The recording contains no media data.' };
  if (typeof document === 'undefined' || typeof window === 'undefined')
    return { playable: false, duration: 0, error: 'Playback validation requires a browser media decoder.' };

  try {
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const video = await input.getPrimaryVideoTrack();
      const audio = await input.getPrimaryAudioTrack();
      if (!video) return { playable: false, duration: 0, error: 'The recording has no video track.' };
      if (!audio) return { playable: false, duration: 0, error: 'The recording has no microphone audio track.' };
      if (!(await video.canDecode())) return { playable: false, duration: 0, error: 'The video codec cannot be decoded on this device.' };
      if (!(await audio.canDecode())) return { playable: false, duration: 0, error: 'The audio codec cannot be decoded on this device.' };
      const duration = await input.computeDuration();
      if (!Number.isFinite(duration) || duration < 0.05)
        return { playable: false, duration: 0, error: 'The encoded recording has no usable duration.' };
      return { playable: true, duration, validatedAt: Date.now() };
    } finally {
      input.dispose();
    }
  } catch (error) {
    return {
      playable: false,
      duration: 0,
      error: `The recorded video could not be validated: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function fileExtensionForMime(mimeType: string): 'mp4' | 'webm' {
  return /^video\/mp4(?:;|$)/i.test(mimeType) ? 'mp4' : 'webm';
}

/** Internal write used by the recorder. Manifest exists before this is called. */
export async function createRecordingTake(args: {
  script: ScriptDocument;
  settings: CaptureSettings;
  startWord: number;
  mimeType: string;
  actualSettings: Record<string, unknown>;
  writerSessionId?: string;
}): Promise<TakeRecord> {
  const now = Date.now();
  const take: TakeRecord = {
    id: makeId('take'),
    scriptId: args.script.id,
    title: args.script.title,
    createdAt: now,
    status: 'recording',
    starred: false,
    mimeType: args.mimeType,
    bytes: 0,
    duration: 0,
    chunks: 0,
    startWord: Math.max(0, Math.floor(args.startWord)),
    endWord: Math.max(0, Math.floor(args.startWord)),
    scriptSnapshot: cloneScript(args.script),
    settings: cloneCaptureSettings(args.settings),
    actualSettings: structuredClone(args.actualSettings),
    playable: false,
    writerSessionId: args.writerSessionId,
    lastHeartbeat: Date.now(),
  };
  await recordingDb.takes.add(take);
  return cloneTake(take);
}

/** Refresh the manifest lease while MediaRecorder is active. */
export async function heartbeatTake(id: string, writerSessionId: string): Promise<void> {
  await recordingDb.takes.update(id, { lastHeartbeat: Date.now(), writerSessionId });
}

/** Append exactly one ordered chunk and update its manifest atomically. */
export async function appendTakeChunk(takeId: string, sequence: number, blob: Blob): Promise<TakeRecord> {
  if (blob.size <= 0) {
    const existing = await getTake(takeId);
    if (!existing) throw new Error('Take not found.');
    return existing;
  }
  let updated: TakeRecord | undefined;
  await recordingDb.transaction('rw', recordingDb.takes, recordingDb.chunks, async () => {
    const current = await recordingDb.takes.get(takeId);
    if (!current) throw new Error('Take manifest is missing; captured data is only available through recovery.');
    if (current.status !== 'recording') throw new Error('This take is no longer accepting media chunks.');
    if (!Number.isInteger(sequence) || sequence !== current.chunks)
      throw new Error('Media chunks arrived out of order; the take was stopped for safety.');
    await recordingDb.chunks.add({ takeId, sequence, blob, bytes: blob.size, createdAt: Date.now() });
    await recordingDb.takes.update(takeId, { chunks: current.chunks + 1, bytes: current.bytes + blob.size });
    const next = await recordingDb.takes.get(takeId);
    if (next) updated = cloneTake(next);
  });
  if (!updated) throw new Error('Take manifest disappeared while writing a chunk.');
  return updated;
}

export async function finalizeRecordingTake(args: {
  id: string;
  endWord?: number;
  duration: number;
  mimeType: string;
}): Promise<TakeRecord> {
  const current = await getTake(args.id);
  if (!current) throw new Error('Take not found.');
  const blob = await getTakeBlob(args.id);
  const validation = await validateRecordingBlob(blob, args.mimeType);
  const patch: Partial<TakeRecord> = {
    mimeType: args.mimeType,
    duration: validation.playable && validation.duration > 0 ? validation.duration : Math.max(0, args.duration),
    endWord: args.endWord === undefined ? current.endWord : Math.max(current.startWord, Math.floor(args.endWord)),
    status: validation.playable && blob.size > 0 ? 'complete' : 'error',
    playable: validation.playable,
    error: validation.error,
    validatedAt: validation.validatedAt,
  };
  await recordingDb.takes.update(args.id, patch);
  const updated = await getTake(args.id);
  if (!updated) throw new Error('Take disappeared during finalization.');
  return updated;
}

export async function markTakeError(id: string, error: unknown): Promise<TakeRecord | undefined> {
  const message = error instanceof Error ? error.message : String(error);
  await recordingDb.takes.update(id, { status: 'error', error: message, playable: false });
  return getTake(id);
}

export async function markTakeInterrupted(id: string, error?: string): Promise<TakeRecord | undefined> {
  await recordingDb.takes.update(id, {
    status: 'interrupted',
    interruptedAt: Date.now(),
    playable: false,
    ...(error ? { error } : {}),
  });
  return getTake(id);
}

export async function recoverInterrupted(): Promise<TakeRecord[]> {
  const staleBefore = Date.now() - 15_000;
  const candidates = (await recordingDb.takes.toArray()).filter((take) => {
    if (take.status === 'error') return true;
    // A recent heartbeat belongs to a live writer in this or another tab. Do
    // not steal its manifest while the camera is still recording.
    return take.status === 'recording' && (!take.lastHeartbeat || take.lastHeartbeat < staleBefore);
  });
  const recovered: TakeRecord[] = [];
  for (const take of candidates) {
    const chunks = await readChunks(take.id);
    const blob = new Blob(chunks.map((chunk) => chunk.blob), { type: take.mimeType || 'application/octet-stream' });
    const validation = await validateRecordingBlob(blob, take.mimeType);
    const message = chunks.length === 0
      ? 'Recording ended before any media chunk was committed.'
      : validation.playable
        ? undefined
        : validation.error ?? 'Captured chunks remain, but this partial recording is not playable.';
    await recordingDb.takes.update(take.id, {
      status: 'interrupted',
      interruptedAt: Date.now(),
      playable: validation.playable,
      ...(validation.playable && validation.validatedAt ? { validatedAt: validation.validatedAt } : {}),
      ...(message ? { error: message } : { error: undefined }),
    });
    const updated = await getTake(take.id);
    if (updated) recovered.push(updated);
  }
  return recovered.sort(compareNewest);
}

export const recordingLibrary: RecordingLibrary = {
  listScripts,
  saveScript,
  deleteScript,
  listTakes,
  getTake,
  updateTake,
  getTakeBlob,
  deleteTake,
  getCaptureSettings,
  saveCaptureSettings,
  recoverInterrupted,
};
