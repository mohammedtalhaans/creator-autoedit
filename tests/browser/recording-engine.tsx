import { createRoot } from 'react-dom/client';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import {
  defaultCaptureSettings,
  defaultPromptSettings,
  recorder,
  recordingLibrary,
  stitchTakes,
} from '../../src/features/recording';
import type { ScriptDocument, TakeRecord } from '../../src/types/recording';

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

async function capture(): Promise<TakeRecord> {
  await recorder.open(defaultCaptureSettings);
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
    };
  } finally {
    input.dispose();
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

declare global {
  interface Window {
    recordingFixture: {
      capture: typeof capture;
      inspect: typeof inspect;
      list: typeof list;
      stitch: typeof stitch;
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
  open: async () => { await recorder.open(defaultCaptureSettings); },
  close: () => recorder.close(),
};

createRoot(document.getElementById('root')!).render(<p>Recording engine fixture ready.</p>);
