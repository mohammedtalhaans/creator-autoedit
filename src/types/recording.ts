export type PromptMode = 'fixed' | 'voice' | 'timed' | 'manual';
export interface PromptSettings {
  mode: PromptMode; wpm: number; targetSeconds: number; fontSize: number;
  fontFamily: string; bold: boolean; lineHeight: number; letterSpacing: number;
  columnWidth: number; margin: number; readingLine: number; textColor: string;
  /** Optional independent gutters/offset for camera-specific reading setups. */
  marginLeft?: number; marginRight?: number; horizontalPosition?: number;
  backgroundColor: string; backgroundOpacity: number; mirror: boolean;
  highContrast: boolean; dimSurrounding: boolean; autoPause: boolean;
  lineTiming: boolean; voiceSensitivity: number; punctuation: boolean;
  commaPause: number; periodPause: number; paragraphPause: number;
}
export interface ScriptDocument {
  id: string; title: string; text: string; updatedAt: number; createdAt: number;
  cursor: number; bookmarks: number[]; settings: PromptSettings;
}
export interface CaptureSettings {
  cameraId: string; microphoneId: string; facingMode: 'user' | 'environment';
  resolution: 720 | 1080 | 2160; fps: 24 | 25 | 30 | 50 | 60;
  /** Whether the requested/displayed recording orientation is vertical. */
  portrait: boolean; monitorAudio: boolean;
  controls: Record<string, string | number | boolean>;
}
export interface TakeRecord {
  id: string; scriptId: string; title: string; createdAt: number;
  status: 'recording' | 'complete' | 'interrupted' | 'error';
  starred: boolean; mimeType: string; bytes: number; duration: number;
  chunks: number; startWord: number; endWord: number;
  scriptSnapshot: ScriptDocument; settings: CaptureSettings;
  actualSettings: Record<string, unknown>; error?: string;
  /** A completed manifest is marked playable only after media validation succeeds. */
  playable?: boolean;
  validatedAt?: number;
  interruptedAt?: number;
  storageError?: string;
  /** Internal lease metadata used to avoid recovering a live recording in another tab. */
  writerSessionId?: string;
  lastHeartbeat?: number;
}
export interface RecorderSnapshot {
  status: 'idle' | 'opening' | 'ready' | 'recording' | 'saving' | 'error';
  stream: MediaStream | null; elapsed: number; level: number;
  savedBytes: number; error: string | null; notice: string | null;
  devices: MediaDeviceInfo[]; capabilities: Record<string, unknown>;
  actualSettings: Record<string, unknown>; activeTake: TakeRecord | null;
}

/** Fields that may be changed after a take has been written. Media bytes are immutable. */
export type TakePatch = Partial<Pick<TakeRecord,
  'title' | 'starred' | 'startWord' | 'endWord' | 'scriptSnapshot' | 'settings' | 'actualSettings'
>> & { error?: string | undefined };

export interface CaptureStorageStatus {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  available: number | null;
}

export interface StitchProgress {
  completed: number;
  total: number;
  phase: 'checking' | 'decoding' | 'encoding' | 'finalizing' | 'verifying';
}

export type StitchProgressHandler = (progress: StitchProgress) => void;

export interface RecordingLibrary {
  listScripts(): Promise<ScriptDocument[]>;
  saveScript(doc: ScriptDocument): Promise<ScriptDocument>;
  deleteScript(id: string): Promise<void>;
  listTakes(scriptId?: string): Promise<TakeRecord[]>;
  getTake(id: string): Promise<TakeRecord | undefined>;
  updateTake(id: string, patch: TakePatch): Promise<TakeRecord | undefined>;
  getTakeBlob(id: string): Promise<Blob>;
  deleteTake(id: string): Promise<void>;
  getCaptureSettings(): Promise<CaptureSettings>;
  saveCaptureSettings(settings: CaptureSettings): Promise<void>;
  recoverInterrupted(): Promise<TakeRecord[]>;
}
