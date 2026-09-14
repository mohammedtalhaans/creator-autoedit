import Dexie, { type Table } from 'dexie';
import type { CaptureSettings, ScriptDocument, TakeRecord } from '../../types/recording';

export interface TakeChunk {
  takeId: string;
  sequence: number;
  blob: Blob;
  bytes: number;
  createdAt: number;
}

export interface CaptureSettingRow {
  key: 'capture';
  value: CaptureSettings;
  updatedAt: number;
}

/**
 * Durable recording stores. Chunks use a compound key so a take can never
 * accidentally read another take's media, even when two tabs are active.
 */
export class RecordingDB extends Dexie {
  scripts!: Table<ScriptDocument, string>;
  takes!: Table<TakeRecord, string>;
  chunks!: Table<TakeChunk, [string, number]>;
  settings!: Table<CaptureSettingRow, string>;

  constructor() {
    super('creator-autoedit-recording');
    this.version(1).stores({
      scripts: 'id, updatedAt, title',
      takes: 'id, scriptId, createdAt, status, startWord, endWord, starred',
      chunks: '[takeId+sequence], takeId, sequence',
      settings: 'key, updatedAt',
    });
  }
}

export const recordingDb = new RecordingDB();

/** Test and recovery helper. It closes the connection without deleting data. */
export async function closeRecordingDatabase(): Promise<void> {
  recordingDb.close();
}

/** Reopens a connection after closeRecordingDatabase or an IndexedDB version change. */
export async function openRecordingDatabase(): Promise<void> {
  if (!recordingDb.isOpen()) await recordingDb.open();
}

