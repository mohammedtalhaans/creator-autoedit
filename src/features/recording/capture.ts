import type {
  CaptureSettings,
  CaptureStorageStatus,
  RecorderSnapshot,
  ScriptDocument,
  TakeRecord,
} from '../../types/recording';
import { cloneCaptureSettings, defaultCaptureSettings } from './defaults';
import {
  appendTakeChunk,
  createRecordingTake,
  finalizeRecordingTake,
  getTake,
  getTakeBlob,
  heartbeatTake,
  markTakeError,
  recordingLibrary,
  saveCaptureSettings,
} from './library';

const CHUNK_INTERVAL_MS = 1_000;
const AUDIO_METER_INTERVAL_MS = 50;

/** Probe order is intentional: native H.264/AAC MP4 first, then WebM. */
export const recordingMimeTypes = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.4D0028,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

export function chooseRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return recordingMimeTypes.find((mime) => {
    try {
      return MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now();
}

function resolutionConstraints(settings: CaptureSettings): { width: MediaTrackConstraintSet['width']; height: MediaTrackConstraintSet['height'] } {
  const landscape = settings.portrait ? settings.resolution : settings.resolution * 16 / 9;
  const portrait = settings.portrait ? settings.resolution * 16 / 9 : settings.resolution;
  return {
    width: { ideal: Math.round(landscape) },
    height: { ideal: Math.round(portrait) },
  };
}

function buildMediaConstraints(settings: CaptureSettings): MediaStreamConstraints {
  const size = resolutionConstraints(settings);
  const video: MediaTrackConstraints = {
    ...size,
    frameRate: { ideal: settings.fps },
    facingMode: settings.cameraId ? undefined : { ideal: settings.facingMode },
    ...(settings.cameraId ? { deviceId: { exact: settings.cameraId } } : {}),
  };
  const audio: MediaTrackConstraints = settings.microphoneId
    ? { deviceId: { exact: settings.microphoneId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  return { video, audio };
}

function trackSettings(stream: MediaStream): Record<string, unknown> {
  const video = stream.getVideoTracks()[0]?.getSettings() ?? {};
  const audio = stream.getAudioTracks()[0]?.getSettings() ?? {};
  return {
    video: { ...video },
    audio: { ...audio },
  };
}

function trackCapabilities(stream: MediaStream): Record<string, unknown> {
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];
  const capabilities: Record<string, unknown> = {};
  try {
    if (videoTrack?.getCapabilities) capabilities.video = { ...videoTrack.getCapabilities() };
  } catch {
    capabilities.video = {};
  }
  try {
    if (audioTrack?.getCapabilities) capabilities.audio = { ...audioTrack.getCapabilities() };
  } catch {
    capabilities.audio = {};
  }
  return capabilities;
}

function hasLiveTracks(stream: MediaStream | null): boolean {
  return Boolean(stream && stream.getVideoTracks().some((track) => track.readyState === 'live') && stream.getAudioTracks().some((track) => track.readyState === 'live'));
}

type WakeLock = WakeLockSentinel & { released?: boolean };

export interface Recorder {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RecorderSnapshot;
  open(settings: CaptureSettings): Promise<MediaStream>;
  start(script: ScriptDocument, startWord?: number): Promise<TakeRecord>;
  stop(endWord?: number): Promise<TakeRecord>;
  close(): Promise<void>;
  applySettings(patch: Partial<CaptureSettings>): Promise<void>;
  switchCamera(settings: CaptureSettings): Promise<void>;
  testMicrophone(): Promise<void>;
  requestPersistentStorage(): Promise<boolean>;
  getStorageStatus(): Promise<CaptureStorageStatus>;
  /** Return captured bytes after a storage failure so the UI can offer a download. */
  getRecoveryBlob(): Promise<Blob | null>;
}

class RecorderEngine implements Recorder {
  private readonly listeners = new Set<() => void>();
  private snapshot: RecorderSnapshot = {
    status: 'idle',
    stream: null,
    elapsed: 0,
    level: 0,
    savedBytes: 0,
    error: null,
    notice: null,
    devices: [],
    capabilities: {},
    actualSettings: {},
    activeTake: null,
  };
  private settings = cloneCaptureSettings(defaultCaptureSettings);
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private currentTakeId: string | null = null;
  private writerSessionId: string | null = null;
  private chunkSequence = 0;
  private startedAt = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private writeFailure: unknown = null;
  private fallbackChunks: Blob[] = [];
  private fallbackTakeId: string | null = null;
  private mediaError: string | null = null;
  private stopEventPromise: Promise<void> | null = null;
  private stopEventResolve: (() => void) | null = null;
  private stopEventReject: ((error: unknown) => void) | null = null;
  private operation: Promise<unknown> = Promise.resolve();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private monitorGain: GainNode | null = null;
  private meterData: Uint8Array<ArrayBuffer> | null = null;
  private wakeLock: WakeLock | null = null;
  private visibilityHandler: (() => void) | null = null;
  private deviceChangeHandler: (() => void) | null = null;
  private trackEndedHandlers: Array<{ track: MediaStreamTrack; handler: () => void }> = [];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): RecorderSnapshot {
    return this.snapshot;
  }

  /** Internal state publication; kept public so the persistence helpers can surface notices. */
  emit(patch: Partial<RecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // One subscriber must not prevent storage/capture cleanup.
      }
    }
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operation.then(operation, operation);
    this.operation = run.then(() => undefined, () => undefined);
    return run;
  }

  async open(settings: CaptureSettings): Promise<MediaStream> {
    return this.serial(() => this.openInternal(settings));
  }

  private async openInternal(inputSettings: CaptureSettings): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Camera and microphone capture is unavailable in this browser.');
    if (this.mediaRecorder?.state === 'recording')
      throw new Error('Stop the current take before opening another camera stream.');

    this.emit({ status: 'opening', error: null, notice: null });
    await this.closeStreamOnly();
    const settings = cloneCaptureSettings(inputSettings);
    const constraints = buildMediaConstraints(settings);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      this.emit({ status: 'error', error: `Camera and microphone access failed: ${errorMessage(error)}`, notice: 'Check browser permissions and device availability, then retry.' });
      throw error;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    if (videoTracks.length === 0 || audioTracks.length === 0) {
      for (const track of stream.getTracks()) track.stop();
      const missing = videoTracks.length === 0 ? 'video' : 'microphone';
      const error = new Error(`The selected input did not provide a ${missing} track. Audio-only capture is disabled.`);
      this.emit({ status: 'error', error: error.message, notice: 'Choose a camera and microphone that are both available.' });
      throw error;
    }

    this.stream = stream;
    this.settings = settings;
    this.attachStreamEvents(stream);
    try {
      await saveCaptureSettings(settings);
    } catch (error) {
      await this.closeStreamOnly();
      const message = `Capture settings could not be saved: ${errorMessage(error)}`;
      this.emit({ status: 'error', error: message, notice: 'Free browser storage or download existing takes before retrying.' });
      throw new Error(message);
    }
    await this.refreshDevices();
    const actualSettings = trackSettings(stream);
    this.emit({
      status: 'ready',
      stream,
      actualSettings,
      capabilities: trackCapabilities(stream),
      savedBytes: 0,
      elapsed: 0,
      activeTake: null,
      error: null,
      notice: null,
    });
    await this.setupAudioMeter(stream, settings.monitorAudio);
    return stream;
  }

  private attachStreamEvents(stream: MediaStream): void {
    this.detachStreamEvents();
    for (const track of stream.getTracks()) {
      const handler = () => {
        if (this.currentTakeId && this.mediaRecorder?.state === 'recording') {
          const message = `${track.kind === 'video' ? 'Camera' : 'Microphone'} disconnected during the take.`;
          this.emit({ status: 'error', error: message, notice: 'The partial recording is retained for recovery/download.' });
          void this.stop().catch(() => undefined);
        } else {
          this.emit({ notice: `${track.kind === 'video' ? 'Camera' : 'Microphone'} disconnected.` });
        }
      };
      track.addEventListener('ended', handler);
      this.trackEndedHandlers.push({ track, handler });
    }
    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden' && this.mediaRecorder?.state === 'recording') {
        this.emit({ notice: 'Keep this page visible while recording; browsers may delay media chunks when hidden.' });
      } else if (document.visibilityState === 'visible') {
        if (this.mediaRecorder?.state === 'recording') void this.acquireWakeLock();
        if (this.snapshot.notice?.startsWith('Keep this page visible')) this.emit({ notice: null });
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityHandler);
    this.deviceChangeHandler = () => { void this.refreshDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', this.deviceChangeHandler);
  }

  private detachStreamEvents(): void {
    for (const { track, handler } of this.trackEndedHandlers) track.removeEventListener('ended', handler);
    this.trackEndedHandlers = [];
    if (this.visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.deviceChangeHandler) navigator.mediaDevices?.removeEventListener?.('devicechange', this.deviceChangeHandler);
    this.deviceChangeHandler = null;
  }

  private async refreshDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.emit({ devices });
    } catch {
      this.emit({ notice: 'Inputs are active, but the browser did not allow device enumeration.' });
    }
  }

  async start(script: ScriptDocument, startWord = script.cursor): Promise<TakeRecord> {
    return this.serial(() => this.startInternal(script, startWord));
  }

  private async startInternal(script: ScriptDocument, startWord: number): Promise<TakeRecord> {
    if (this.mediaRecorder?.state === 'recording' || this.currentTakeId)
      throw new Error('A take is already recording. Stop it before starting another take.');
    if (!hasLiveTracks(this.stream))
      throw new Error('Open a live camera and microphone before starting a take.');
    if (typeof MediaRecorder === 'undefined')
      throw new Error('MediaRecorder is unavailable in this browser.');

    const persistedScript = await recordingLibrary.saveScript(script);
    await saveCaptureSettings(this.settings);
    const requestedMime = chooseRecordingMimeType();
    let media: MediaRecorder;
    try {
      media = requestedMime
        ? new MediaRecorder(this.stream!, { mimeType: requestedMime })
        : new MediaRecorder(this.stream!);
    } catch (error) {
      throw new Error(`This browser cannot encode a camera-and-microphone recording: ${errorMessage(error)}`);
    }
    const actualMime = media.mimeType || requestedMime || 'video/webm';
    if (!actualMime.startsWith('video/'))
      throw new Error(`The browser selected an invalid recording MIME type (${actualMime}).`);

    const writerSessionId = globalThis.crypto?.randomUUID?.() ?? `writer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const take = await createRecordingTake({
      script: persistedScript,
      settings: this.settings,
      startWord,
      mimeType: actualMime,
      actualSettings: trackSettings(this.stream!),
      writerSessionId,
    });
    this.mediaRecorder = media;
    this.currentTakeId = take.id;
    this.writerSessionId = writerSessionId;
    this.chunkSequence = 0;
    this.startedAt = monotonicNow();
    this.writeChain = Promise.resolve();
    this.writeFailure = null;
    this.fallbackChunks = [];
    this.fallbackTakeId = null;
    this.mediaError = null;
    this.stopEventPromise = null;
    this.stopEventResolve = null;
    this.stopEventReject = null;
    media.ondataavailable = (event) => this.handleData(event.data);
    media.onstop = () => {
      this.stopEventResolve?.();
      this.stopEventResolve = null;
      this.stopEventReject = null;
    };
    media.onerror = (event) => this.handleMediaError(event);
    try {
      media.start(CHUNK_INTERVAL_MS);
    } catch (error) {
      await markTakeError(take.id, error);
      this.currentTakeId = null;
      this.mediaRecorder = null;
      throw error;
    }
    this.heartbeatTimer = setInterval(() => {
      if (this.currentTakeId && this.writerSessionId) void heartbeatTake(this.currentTakeId, this.writerSessionId);
    }, 3_000);
    await this.acquireWakeLock();
    this.emit({ status: 'recording', activeTake: take, elapsed: 0, savedBytes: 0, error: null, notice: null });
    return take;
  }

  private handleData(blob: Blob): void {
    if (!blob || blob.size <= 0 || !this.currentTakeId) return;
    const takeId = this.currentTakeId;
    const sequence = this.chunkSequence++;
    const write = this.writeChain.then(async () => {
      if (this.writeFailure) {
        this.fallbackChunks.push(blob);
        throw this.writeFailure;
      }
      try {
        const updated = await appendTakeChunk(takeId, sequence, blob);
        this.emit({
          savedBytes: updated.bytes,
          activeTake: updated,
          elapsed: Math.max(0, (monotonicNow() - this.startedAt) / 1_000),
        });
      } catch (error) {
        this.writeFailure = error;
        this.fallbackChunks.push(blob);
        this.fallbackTakeId = takeId;
        this.emit({ status: 'error', error: errorMessage(error), notice: 'Storage failed. Stop now to keep a download copy of captured data.' });
        throw error;
      }
    });
    this.writeChain = write.catch(() => undefined);
  }

  private handleMediaError(event: Event): void {
    this.mediaError = `MediaRecorder error: ${event instanceof ErrorEvent ? event.message : 'the browser stopped encoding'}`;
    this.emit({ status: 'error', error: this.mediaError, notice: 'The partial recording is retained for recovery/download.' });
    this.stopEventResolve?.();
    if (this.currentTakeId && this.mediaRecorder?.state === 'recording') void this.stop().catch(() => undefined);
  }

  async stop(endWord?: number): Promise<TakeRecord> {
    return this.serial(() => this.stopInternal(endWord));
  }

  private async stopInternal(endWord?: number): Promise<TakeRecord> {
    const takeId = this.currentTakeId;
    const media = this.mediaRecorder;
    if (!takeId || !media) throw new Error('There is no active take to stop.');
    if (this.stopEventPromise) {
      await this.stopEventPromise;
      const existing = await getTake(takeId);
      if (!existing) throw new Error('The active take manifest disappeared.');
      return existing;
    }

    this.emit({ status: 'saving', activeTake: this.snapshot.activeTake, notice: 'Saving camera and microphone data…', error: null });
    this.stopEventPromise = new Promise<void>((resolve, reject) => {
      this.stopEventResolve = resolve;
      this.stopEventReject = reject;
    });
    try {
      if (media.state === 'recording' || media.state === 'paused') media.stop();
      else this.stopEventResolve?.();
      await this.stopEventPromise;
    } catch (error) {
      this.mediaError ??= errorMessage(error);
    }
    await this.writeChain;
    this.stopHeartbeat();
    const duration = Math.max(0, (monotonicNow() - this.startedAt) / 1_000);
    let result: TakeRecord;
    if (this.writeFailure || this.mediaError) {
      const failure = this.writeFailure ? errorMessage(this.writeFailure) : this.mediaError!;
      const marked = await markTakeError(takeId, failure);
      const loaded = marked ?? (await getTake(takeId));
      if (!loaded) throw new Error('The active take manifest disappeared while saving.');
      result = loaded;
      this.fallbackTakeId = takeId;
      this.emit({ status: 'error', error: failure, notice: 'Some captured data may only be available through the recovery download.' });
    } else {
      result = await finalizeRecordingTake({ id: takeId, endWord, duration, mimeType: media.mimeType || 'video/webm' });
      if (result.status === 'complete') {
        this.fallbackChunks = [];
        this.fallbackTakeId = null;
        this.emit({ status: 'ready', notice: null, error: null });
      } else {
        this.fallbackTakeId = takeId;
        this.emit({ status: 'error', error: result.error ?? 'The recording could not be validated.', notice: 'The original chunks are retained for recovery/download.' });
      }
    }

    this.mediaRecorder = null;
    this.currentTakeId = null;
    this.writerSessionId = null;
    this.stopEventPromise = null;
    this.stopEventResolve = null;
    this.stopEventReject = null;
    this.releaseWakeLock();
    this.emit({
      activeTake: result,
      elapsed: result.duration || duration,
      savedBytes: result.bytes,
      status: result.status === 'complete' ? 'ready' : 'error',
    });
    return result;
  }

  async close(): Promise<void> {
    return this.serial(() => this.closeInternal());
  }

  private async closeInternal(): Promise<void> {
    if (this.currentTakeId) {
      try {
        await this.stopInternal();
      } catch (error) {
        this.emit({ status: 'error', error: errorMessage(error), notice: 'The take remains available through recovery.' });
      }
    }
    await this.closeStreamOnly();
    this.emit({ status: 'idle', stream: null, activeTake: null, elapsed: 0, level: 0, savedBytes: 0 });
  }

  private async closeStreamOnly(): Promise<void> {
    this.stopHeartbeat();
    this.detachStreamEvents();
    this.stopAudioMeter();
    this.releaseWakeLock();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    this.stream = null;
    this.emit({ stream: null });
  }

  async applySettings(patch: Partial<CaptureSettings>): Promise<void> {
    return this.serial(() => this.applySettingsInternal(patch));
  }

  private async applySettingsInternal(patch: Partial<CaptureSettings>): Promise<void> {
    const switchingKeys: Array<keyof CaptureSettings> = ['cameraId', 'microphoneId', 'facingMode', 'resolution', 'fps', 'portrait'];
    if (this.currentTakeId && switchingKeys.some((key) => patch[key] !== undefined))
      throw new Error('Stop the current take before changing camera, microphone, orientation, resolution, or frame rate.');
    const next = cloneCaptureSettings({ ...this.settings, ...patch, controls: { ...this.settings.controls, ...(patch.controls ?? {}) } });
    if (this.stream && patch.controls) await this.applyTrackControls(patch.controls);
    await saveCaptureSettings(next);
    this.settings = next;
    if (this.stream) {
      this.emit({ actualSettings: trackSettings(this.stream), capabilities: trackCapabilities(this.stream) });
      await this.setupAudioMeter(this.stream, next.monitorAudio);
    }
  }

  private async applyTrackControls(controls: CaptureSettings['controls']): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;
    let capabilities: MediaTrackCapabilities = {};
    try {
      capabilities = track.getCapabilities();
    } catch {
      throw new Error('The browser did not expose camera hardware controls.');
    }
    const unsupported = Object.keys(controls).filter((key) => !(key in capabilities));
    if (unsupported.length > 0)
      throw new Error(`This camera does not expose these controls: ${unsupported.join(', ')}.`);
    for (const [key, value] of Object.entries(controls)) {
      try {
        await track.applyConstraints({ advanced: [{ [key]: value } as MediaTrackConstraintSet] });
      } catch (error) {
        throw new Error(`Camera control ${key} is unsupported or rejected: ${errorMessage(error)}`);
      }
    }
  }

  async switchCamera(settings: CaptureSettings): Promise<void> {
    return this.serial(() => this.switchCameraInternal(settings));
  }

  private async switchCameraInternal(settings: CaptureSettings): Promise<void> {
    if (this.currentTakeId) await this.stopInternal();
    await this.closeStreamOnly();
    await this.openInternal(settings);
  }

  async testMicrophone(): Promise<void> {
    return this.serial(() => this.testMicrophoneInternal());
  }

  private async testMicrophoneInternal(): Promise<void> {
    if (!this.stream) throw new Error('Open the camera and microphone before testing levels.');
    const analyser = this.audioAnalyser;
    if (!analyser) throw new Error('The browser audio meter is unavailable.');
    const data = new Uint8Array(analyser.fftSize);
    const started = monotonicNow();
    let peak = 0;
    while (monotonicNow() - started < 500) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      peak = Math.max(peak, Math.sqrt(sum / data.length));
      await new Promise<void>((resolve) => setTimeout(resolve, AUDIO_METER_INTERVAL_MS));
    }
    const level = Math.min(1, peak * 2.4);
    this.emit({ level, notice: level > 0.015 ? `Microphone test complete · peak ${(level * 100).toFixed(0)}%` : 'No microphone signal detected during the test.' });
  }

  private async setupAudioMeter(stream: MediaStream, monitor: boolean): Promise<void> {
    this.stopAudioMeter();
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      let monitorGain: GainNode | null = null;
      if (monitor) {
        monitorGain = context.createGain();
        monitorGain.gain.value = 0.05;
        source.connect(monitorGain);
        monitorGain.connect(context.destination);
      }
      this.audioContext = context;
      this.audioSource = source;
      this.audioAnalyser = analyser;
      this.monitorGain = monitorGain;
      this.meterData = new Uint8Array(analyser.fftSize);
      this.meterTimer = setInterval(() => {
        if (!this.audioAnalyser || !this.meterData) return;
        this.audioAnalyser.getByteTimeDomainData(this.meterData);
        let sum = 0;
        for (const value of this.meterData) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        this.emit({ level: Math.min(1, Math.sqrt(sum / this.meterData.length) * 2.4) });
      }, AUDIO_METER_INTERVAL_MS);
    } catch {
      this.stopAudioMeter();
      this.emit({ notice: 'Camera is ready, but live microphone metering is unavailable in this browser.' });
    }
  }

  private stopAudioMeter(): void {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    try { this.audioSource?.disconnect(); } catch { /* already disconnected */ }
    try { this.monitorGain?.disconnect(); } catch { /* already disconnected */ }
    this.audioSource = null;
    this.audioAnalyser = null;
    this.monitorGain = null;
    this.meterData = null;
    if (this.audioContext) void this.audioContext.close().catch(() => undefined);
    this.audioContext = null;
    this.emit({ level: 0 });
  }

  private async acquireWakeLock(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock?.request) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen') as WakeLock;
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch {
      this.emit({ notice: 'Screen wake lock was unavailable; keep the device powered while recording.' });
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLock) void this.wakeLock.release().catch(() => undefined);
    this.wakeLock = null;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async requestPersistentStorage(): Promise<boolean> {
    return requestPersistentStorage();
  }

  async getStorageStatus(): Promise<CaptureStorageStatus> {
    return getStorageStatus();
  }

  async getRecoveryBlob(): Promise<Blob | null> {
    const id = this.fallbackTakeId;
    if (!id) return null;
    const take = await getTake(id);
    if (!take) return null;
    let persisted: Blob;
    try {
      persisted = await getTakeBlob(id);
    } catch {
      persisted = new Blob([], { type: take.mimeType });
    }
    return new Blob([persisted, ...this.fallbackChunks], { type: take.mimeType });
  }
}

export async function getStorageStatus(): Promise<CaptureStorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage)
    return { supported: false, persisted: null, usage: null, quota: null, available: null };
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const estimate = await navigator.storage.estimate();
    usage = typeof estimate.usage === 'number' ? estimate.usage : null;
    quota = typeof estimate.quota === 'number' ? estimate.quota : null;
  } catch {
    // Keep unknown storage estimates explicit in the UI.
  }
  let persisted: boolean | null = null;
  try {
    if (navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch {
    persisted = null;
  }
  return { supported: true, persisted, usage, quota, available: quota === null || usage === null ? null : Math.max(0, quota - usage) };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    const persisted = await navigator.storage.persist();
    recorderInternalNotice(persisted ? 'Persistent browser storage granted.' : 'Browser storage persistence was not granted; keep external downloads for important takes.');
    return persisted;
  } catch (error) {
    recorderInternalNotice(`Storage persistence request failed: ${errorMessage(error)}`);
    return false;
  }
}

let recorderInstance: RecorderEngine | null = null;
function recorderInternalNotice(notice: string): void {
  recorderInstance?.emit({ notice });
}

export const recorder: Recorder = (recorderInstance = new RecorderEngine());
