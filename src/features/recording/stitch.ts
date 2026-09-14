import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { StitchProgressHandler, TakeRecord } from '../../types/recording';
import type { StitchProgress } from '../../types/recording';
import { assertActive } from '../../lib/utils';
import { supportedAvc } from '../media/capabilities';
import { PagedFile } from '../exporter/paged-target';
import { getTake, getTakeBlob, validateRecordingBlob } from './library';

const COMMON_AUDIO_RATE = 48_000;
const COMMON_AUDIO_CHANNELS = 2;

function progress(onProgress: StitchProgressHandler, value: StitchProgress): void {
  onProgress(value);
}

function takePriority(take: TakeRecord): [number, number, number, string] {
  return [take.starred ? 1 : 0, take.playable === false ? 0 : 1, take.createdAt, take.id];
}

function comparePriority(a: TakeRecord, b: TakeRecord): number {
  const [aStar, aPlayable, aCreated, aId] = takePriority(a);
  const [bStar, bPlayable, bCreated, bId] = takePriority(b);
  return bStar - aStar || bPlayable - aPlayable || bCreated - aCreated || aId.localeCompare(bId);
}

/**
 * Choose one deterministic take for each script range, then remove overlap.
 * “Best” means starred, then playable, then newest; no subjective quality
 * score is inferred from the recording itself.
 */
export function selectBestTakes(takes: TakeRecord[]): TakeRecord[] {
  const groups = new Map<string, TakeRecord[]>();
  for (const take of takes) {
    if (take.status !== 'complete' || take.bytes <= 0 || take.endWord <= take.startWord) continue;
    const key = `${take.scriptId}:${take.startWord}:${take.endWord}`;
    const group = groups.get(key) ?? [];
    group.push(take);
    groups.set(key, group);
  }
  const candidates = [...groups.values()].map((group) => [...group].sort(comparePriority)[0]);
  candidates.sort((a, b) => a.startWord - b.startWord || a.endWord - b.endWord || comparePriority(a, b));
  const selected: TakeRecord[] = [];
  for (const candidate of candidates) {
    const overlaps = selected.filter((take) => candidate.startWord < take.endWord && take.startWord < candidate.endWord);
    if (overlaps.length === 0) {
      selected.push(candidate);
      continue;
    }
    const beatsEveryOverlap = overlaps.every((take) => comparePriority(candidate, take) < 0);
    if (beatsEveryOverlap) {
      for (const overlap of overlaps) selected.splice(selected.indexOf(overlap), 1);
      selected.push(candidate);
    }
  }
  return selected.sort((a, b) => a.startWord - b.startWord || a.endWord - b.endWord || a.id.localeCompare(b.id));
}

function roundEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function stitchError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/decode|codec|encoder|webcodecs|mediabunny/i.test(message))
    return new Error(`These takes cannot be assembled on this device: ${message} Try selecting takes recorded with a browser-supported MP4 or WebM codec.`);
  return new Error(message);
}

/**
 * Decode each source and encode one normalized MP4 in the chosen order. Every
 * source manifest/chunk remains untouched; a failed stitch never replaces an
 * original take.
 */
export async function stitchTakes(
  ids: string[],
  onProgress: StitchProgressHandler = () => undefined,
  signal?: AbortSignal,
): Promise<File> {
  if (ids.length === 0) throw new Error('Select at least one take to assemble.');
  if (typeof document === 'undefined') throw new Error('Take assembly requires a browser media decoder.');
  const abortSignal = signal ?? new AbortController().signal;
  assertActive(abortSignal);

  const takes: TakeRecord[] = [];
  const blobs: Blob[] = [];
  for (const id of ids) {
    const take = await getTake(id);
    if (!take) throw new Error(`Take ${id} was not found.`);
    if (take.status !== 'complete' || take.playable === false || take.bytes <= 0)
      throw new Error(`Take “${take.title}” is not a validated completed recording and cannot be assembled.`);
    const blob = await getTakeBlob(id);
    const check = await validateRecordingBlob(blob, take.mimeType);
    if (!check.playable)
      throw new Error(`Take “${take.title}” failed playback validation: ${check.error ?? 'unknown media error'}`);
    takes.push(take);
    blobs.push(blob);
  }

  progress(onProgress, { completed: 0, total: takes.length, phase: 'checking' });
  const inputs: Input[] = [];
  const metas: Array<{ width: number; height: number; duration: number; videoFirst: number; audioFirst: number }> = [];
  try {
    for (let index = 0; index < blobs.length; index++) {
      assertActive(abortSignal);
      let input: Input | undefined;
      try {
        input = new Input({ source: new BlobSource(blobs[index]), formats: ALL_FORMATS });
        const video = await input.getPrimaryVideoTrack();
        const audio = await input.getPrimaryAudioTrack();
        if (!video || !audio) throw new Error('A selected recording is missing video or microphone audio.');
        if (!(await video.canDecode()) || !(await audio.canDecode())) throw new Error('A selected codec cannot be decoded.');
        const [width, height, duration, videoFirst, audioFirst] = await Promise.all([
          video.getDisplayWidth(), video.getDisplayHeight(), input.computeDuration(), video.getFirstTimestamp(), audio.getFirstTimestamp(),
        ]);
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('A selected recording has no usable duration.');
        inputs.push(input);
        metas.push({ width, height, duration, videoFirst, audioFirst });
      } catch (error) {
        input?.dispose();
        throw stitchError(error);
      }
      progress(onProgress, { completed: index + 1, total: takes.length, phase: 'checking' });
    }

    const portrait = metas[0].height > metas[0].width;
    const longSide = Math.min(1920, roundEven(Math.max(...metas.map((meta) => Math.max(meta.width, meta.height)))));
    const shortSide = Math.min(1080, roundEven(Math.max(...metas.map((meta) => Math.min(meta.width, meta.height)))));
    const width = portrait ? shortSide : longSide;
    const height = portrait ? longSide : shortSide;
    const videoCodec = await supportedAvc(width, height);
    if (!videoCodec || !(await canEncodeVideo('avc', { width, height })))
      throw new Error('This device cannot encode the normalized stitch size. Try shorter takes or record at 720p.');
    const audioQuality = new Quality({ bitrate: 128_000 });
    let audioCodecAvailable = await canEncodeAudio('aac', { numberOfChannels: COMMON_AUDIO_CHANNELS, sampleRate: COMMON_AUDIO_RATE, quality: audioQuality });
    if (!audioCodecAvailable) {
      const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
      registerAacEncoder();
      audioCodecAvailable = await canEncodeAudio('aac', { numberOfChannels: COMMON_AUDIO_CHANNELS, sampleRate: COMMON_AUDIO_RATE, quality: audioQuality });
    }
    if (!audioCodecAvailable)
      throw new Error('AAC audio encoding is unavailable on this device, so these takes cannot be assembled.');

    const file = new PagedFile(512 * 1024 * 1024);
    const target = new StreamTarget(new WritableStream({
      write: (chunk: { data: Uint8Array; position: number }) => {
        assertActive(abortSignal);
        file.write(chunk.data, chunk.position);
      },
    }));
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('The browser drawing surface is unavailable for take assembly.');
    const videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      fullCodecString: videoCodec,
      quality: new Quality({ bitrate: width >= 1080 ? 5_000_000 : 2_400_000 }),
      latencyMode: 'quality',
      keyFrameInterval: 2,
    });
    const audioSource = new AudioSampleSource({
      codec: 'aac',
      quality: audioQuality,
      transform: { sampleRate: COMMON_AUDIO_RATE, numberOfChannels: COMMON_AUDIO_CHANNELS, sampleFormat: 'f32' },
    });
    output.addVideoTrack(videoSource, { frameRate: 30 });
    output.addAudioTrack(audioSource);
    await output.start();

    const totalFrames = Math.max(1, Math.round(metas.reduce((sum, meta) => sum + meta.duration, 0) * 30));
    let completedFrames = 0;
    let outputOffset = 0;
    try {
      for (let index = 0; index < inputs.length; index++) {
        assertActive(abortSignal);
        const input = inputs[index];
        const video = await input.getPrimaryVideoTrack();
        const audio = await input.getPrimaryAudioTrack();
        if (!video || !audio) throw new Error('A selected recording lost a required media track during assembly.');
        const videoSink = new CanvasSink(video, { width, height, fit: 'cover', poolSize: 1 });
        progress(onProgress, { completed: completedFrames, total: totalFrames, phase: 'decoding' });
        for await (const frame of videoSink.canvases()) {
          assertActive(abortSignal);
          context.drawImage(frame.canvas, 0, 0, width, height);
          await videoSource.add(outputOffset + Math.max(0, frame.timestamp - metas[index].videoFirst), Math.max(1 / 120, frame.duration || 1 / 30), { keyFrame: completedFrames % 60 === 0 });
          completedFrames++;
          if (completedFrames % 6 === 0) progress(onProgress, { completed: completedFrames, total: totalFrames, phase: 'encoding' });
        }
        const audioSink = new AudioSampleSink(audio);
        for await (const sample of audioSink.samples()) {
          assertActive(abortSignal);
          sample.setTimestamp(outputOffset + Math.max(0, sample.timestamp - metas[index].audioFirst));
          try {
            await audioSource.add(sample);
          } finally {
            sample.close();
          }
        }
        outputOffset += metas[index].duration;
      }
      videoSource.close();
      audioSource.close();
      progress(onProgress, { completed: totalFrames, total: totalFrames, phase: 'finalizing' });
      await output.finalize();
      assertActive(abortSignal);
      const blob = file.blob();
      progress(onProgress, { completed: totalFrames, total: totalFrames, phase: 'verifying' });
      const verify = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      try {
        const video = await verify.getPrimaryVideoTrack();
        const audio = await verify.getPrimaryAudioTrack();
        if (!video || !audio || !(await video.canDecode()) || !(await audio.canDecode()))
          throw new Error('The assembled MP4 did not pass playback validation.');
        const duration = await verify.computeDuration();
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('The assembled MP4 has no duration.');
      } finally {
        verify.dispose();
      }
      return new File([blob], `creator-autoedit-stitch-${Date.now()}.mp4`, { type: 'video/mp4' });
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw stitchError(error);
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      file.clear();
    }
  } finally {
    for (const input of inputs) input.dispose();
  }
}
