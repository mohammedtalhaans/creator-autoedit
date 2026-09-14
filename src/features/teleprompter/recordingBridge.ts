import type { CaptureSettings, PromptSettings, RecorderSnapshot, ScriptDocument, TakePatch, TakeRecord } from '../../types/recording'
import { defaultCaptureSettings as captureDefaults, defaultPromptSettings as capturePromptDefaults } from '../recording/defaults'
import { recordingLibrary as captureLibrary } from '../recording/library'
import { recorder as captureRecorder } from '../recording/capture'

/**
 * Narrow UI-facing contract for the capture feature. Durable scripts, takes,
 * chunks, recovery and negotiated device state remain owned by recording/.
 */
export interface RecordingLibraryLike {
  listScripts: () => Promise<ScriptDocument[]>
  saveScript: (script: ScriptDocument) => Promise<ScriptDocument>
  deleteScript: (id: string) => Promise<void>
  listTakes: (scriptId?: string) => Promise<TakeRecord[]>
  getTake: (id: string) => Promise<TakeRecord | undefined>
  updateTake: (id: string, patch: TakePatch) => Promise<TakeRecord | undefined>
  getTakeBlob: (id: string) => Promise<Blob>
  deleteTake: (id: string) => Promise<void>
  getCaptureSettings: () => Promise<CaptureSettings>
  saveCaptureSettings: (settings: CaptureSettings) => Promise<void>
  recoverInterrupted: () => Promise<TakeRecord[]>
}

export interface RecorderLike {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => RecorderSnapshot
  open: (settings: CaptureSettings) => Promise<MediaStream>
  start: (script: ScriptDocument, startWord?: number) => Promise<TakeRecord>
  stop: (endWord?: number) => Promise<TakeRecord>
  close: () => Promise<void>
  applySettings: (settings: Partial<CaptureSettings>) => Promise<void>
  switchCamera: (settings: CaptureSettings) => Promise<void>
  testMicrophone: () => Promise<unknown>
  requestPersistentStorage?: () => Promise<boolean>
  getRecoveryBlob?: () => Promise<Blob | null>
}

export interface RecordingRuntime {
  recordingLibrary: RecordingLibraryLike
  recorder: RecorderLike
  defaultPromptSettings: () => PromptSettings
  defaultCaptureSettings: () => CaptureSettings
}

let registeredRuntime: RecordingRuntime | undefined

/** Test harnesses may register a compatible fake; production always uses capture/. */
export function registerRecordingRuntime(runtime: RecordingRuntime): void { registeredRuntime = runtime }

export function getRecordingRuntime(): RecordingRuntime {
  if (registeredRuntime) return registeredRuntime
  return {
    recordingLibrary: captureLibrary,
    recorder: captureRecorder,
    defaultPromptSettings: () => ({ ...capturePromptDefaults }),
    defaultCaptureSettings: () => ({ ...captureDefaults, controls: { ...captureDefaults.controls } }),
  }
}

export function createScriptDocument(title: string, text: string, settings = getRecordingRuntime().defaultPromptSettings()): ScriptDocument {
  const now = Date.now()
  return { id: globalThis.crypto?.randomUUID?.() ?? `script-${now}`, title: title.trim() || 'Untitled script', text, updatedAt: now, createdAt: now, cursor: 0, bookmarks: [], settings: { ...settings } }
}

export async function importPromptFile(file: File): Promise<{ title: string; text: string }> {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  if (extension === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { title: file.name.replace(/\.docx$/i, ''), text: result.value }
  }
  return { title: file.name.replace(/\.(txt|md|markdown)$/i, ''), text: await file.text() }
}
