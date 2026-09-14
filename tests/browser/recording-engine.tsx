import { createRoot } from 'react-dom/client';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import {
  defaultCaptureSettings,
  defaultPromptSettings,
  measureDrawnFrame,
  recorder,
  recordingLibrary,
  stitchTakes,
} from '../../src/features/recording';
import type { CaptureSettings, ScriptDocument, TakeRecord } from '../../src/types/recording';

const script: ScriptDocument = {
  id: 'browser-recording-script',
  title: 'Browser recording fixture',
  text: 'A controlled camera and microphone recording.',
  createdAt: 1,
  updatedAt: 1,
  cursor: 0,
  bookmarks: [],
  settings: defaultPromptSettings,
};

async function capture(settings: CaptureSettings = defaultCaptureSettings, options: { forceLandscapeSource?: boolean } = {}): Promise<TakeRecord> {
  await recorder.open(settings);
  if (options.forceLandscapeSource) {
    try { await recorder.getSnapshot().stream?.getVideoTracks()[0]?.applyConstraints({ width: { exact: 640 }, height: { exact: 480 } }); } catch { /* Fake cameras may not expose applyConstraints. */ }
  }
  await recorder.start(script, 0);
  await new Promise<void>((resolve) => setTimeout(resolve, 2_200));
  return recorder.stop(8);
}

async function inspect(id: string) {
  const take = await recordingLibrary.getTake(id);
  if (!take) throw new Error('Take disappeared from IndexedDB.');
  const blob = await recordingLibrary.getTakeBlob(id);
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video || !audio) throw new Error('Validated take is missing video or audio.');
    const dimensions = await decodeDimensions(blob);
    return {
      id,
      status: take.status,
      playable: take.playable,
      mimeType: take.mimeType,
      bytes: blob.size,
      chunks: take.chunks,
      duration: await input.computeDuration(),
      videoCodec: await video.getCodec(),
      audioCodec: await audio.getCodec(),
      canDecodeVideo: await video.canDecode(),
      canDecodeAudio: await audio.canDecode(),
      videoWidth: dimensions.width,
      videoHeight: dimensions.height,
    };
  } finally {
    input.dispose();
  }
}

async function decodeDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  video.src = url;
  video.muted = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video dimensions could not be decoded.'));
      video.load();
    });
    return { width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function list() {
  return recordingLibrary.listTakes(script.id);
}

async function stitch(ids: string[]) {
  const file = await stitchTakes(ids, () => undefined, new AbortController().signal);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video || !audio) throw new Error('Stitch output is missing video or audio.');
    return {
      name: file.name,
      bytes: file.size,
      duration: await input.computeDuration(),
      videoCodec: await video.getCodec(),
      audioCodec: await audio.getCodec(),
      canDecodeVideo: await video.canDecode(),
      canDecodeAudio: await audio.canDecode(),
    };
  } finally {
    input.dispose();
  }
}

async function probePortraitFrame() {
  const source = document.createElement('canvas');
  source.width = 180;
  source.height = 320;
  const context = source.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable.');
  context.fillStyle = '#f43f5e';
  context.fillRect(0, 0, source.width, source.height);
  const stream = source.captureStream(30);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  document.body.append(video);
  try {
    await video.play();
    if (video.readyState < 2) await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }));
    // Deliberately pass landscape track metadata for a portrait picture, which
    // reproduces the WebKit disagreement the production probe must resolve.
    return measureDrawnFrame(video, 320, 180);
  } finally {
    video.pause();
    video.srcObject = null;
    video.remove();
    stream.getTracks().forEach((track) => track.stop());
  }
}

declare global {
  interface Window {
    recordingFixture: {
      capture: typeof capture;
      inspect: typeof inspect;
      list: typeof list;
      stitch: typeof stitch;
      probePortraitFrame: typeof probePortraitFrame;
      open: () => Promise<void>;
      close: () => Promise<void>;
    };
  }
}

window.recordingFixture = {
  capture,
  inspect,
  list,
  stitch,
  probePortraitFrame,
  open: async () => { await recorder.open(defaultCaptureSettings); },
  close: () => recorder.close(),
};

createRoot(document.getElementById('root')!).render(<p>Recording engine fixture ready.</p>);
