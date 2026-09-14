import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AutoModel, Tensor, env } from '@huggingface/transformers';
import { decisionsFor, pausesFromSpeechSegments, speechSegmentsFromProbabilities } from '../src/features/silence/index.ts';

const manifest = JSON.parse(await readFile(new URL('../tests/fixtures/demo-manifest.json', import.meta.url), 'utf8'));
const source = new URL('../public/demo/one-take.mp4', import.meta.url);
const pcmPath = join(tmpdir(), `creator-autoedit-speech-noise-${process.pid}.f32`);
const ffmpeg = spawnSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(source), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-y', pcmPath], { encoding: 'utf8' });
if (ffmpeg.status !== 0) throw new Error(ffmpeg.stderr || 'ffmpeg could not decode the demo audio');
const pcmBytes = await readFile(pcmPath);
const original = new Float32Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 4)).slice();
const duration = original.length / 16000;
const gaps = [
  { start: 2.6764791667, end: 4.1264791667, kind: 'noise plateau', amplitude: .055 },
  { start: 6.9208125, end: 8.8208125, kind: '440 Hz tone', amplitude: .07 },
  { start: 12.0557708333, end: 13.4057708333, kind: 'deterministic clicks', amplitude: .34 },
  { start: 16.8607916667, end: 17.5, kind: 'noise plateau', amplitude: .04 },
];
const augmented = original.slice();
for (let i = 0; i < augmented.length; i++) {
  const time = i / 16000;
  for (const gap of gaps) {
    if (time < gap.start || time >= gap.end) continue;
    const local = time - gap.start;
    let value = 0;
    if (gap.kind === 'noise plateau') value = gap.amplitude * (Math.sin(i * 1.731) * .65 + Math.sin(i * .417) * .35);
    else if (gap.kind === '440 Hz tone') value = gap.amplitude * Math.sin(2 * Math.PI * 440 * local);
    else {
      for (const click of [.33, .91]) {
        const age = local - click;
        if (age >= 0 && age < .025) value += gap.amplitude * Math.exp(-age * 220) * Math.sin(2 * Math.PI * 1800 * age);
      }
    }
    augmented[i] = Math.max(-1, Math.min(1, augmented[i] + value));
    break;
  }
}

env.allowLocalModels = false;
env.useBrowserCache = false;
const modelRevision = 'e71cae966052b992a7eca6b17738916ce0eca4ec';
const model = await AutoModel.from_pretrained('onnx-community/silero-vad', { revision: modelRevision, config: { model_type: 'custom' }, dtype: 'fp32' });
const sampleRate = new Tensor('int64', [16000], []);
async function score(audio, contextual) {
  let state = new Tensor('float32', new Float32Array(256), [2, 1, 128]);
  let context = new Float32Array(64);
  const scores = [];
  for (let offset = 0; offset < audio.length; offset += 512) {
    const frame = new Float32Array(512);
    frame.set(audio.subarray(offset, Math.min(audio.length, offset + 512)));
    const input = contextual ? new Float32Array(576) : frame;
    if (contextual) { input.set(context); input.set(frame, 64); }
    const result = await model({ input: new Tensor('float32', input, [1, input.length]), sr: sampleRate, state });
    state = result.stateN;
    if (contextual) context = input.slice(512);
    scores.push(result.output.data[0] ?? 0);
  }
  return scores;
}
const unionDuration = (ranges) => {
  const sorted = ranges.filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  let total = 0, end = -Infinity;
  for (const range of sorted) { if (range.start > end) total += range.end - range.start; else if (range.end > end) total += range.end - end; end = Math.max(end, range.end); }
  return total;
};
const coverage = (segments, ranges) => unionDuration(ranges.flatMap(range => segments.flatMap(segment => { const start = Math.max(range.start, segment.start), end = Math.min(range.end, segment.end); return end > start ? [{ start, end }] : []; })));
const falsePositive = (segments, ranges) => coverage(segments, ranges);
const speechRanges = manifest.phrases.map(phrase => ({ start: phrase.start, end: phrase.end }));
const gapRanges = gaps.map(gap => ({ start: gap.start, end: Math.min(duration, gap.end) }));
const newProbabilities = await score(augmented, true);
const oldProbabilities = await score(augmented, false);
const newSegments = speechSegmentsFromProbabilities(newProbabilities, duration, { sampleRate: 16000, frameSize: 512, threshold: .5, exitThreshold: .35, minSilenceFrames: 2, minSpeechFrames: 3 });
const oldSegments = speechSegmentsFromProbabilities(oldProbabilities, duration, { sampleRate: 16000, frameSize: 512, threshold: .3, exitThreshold: .08, minSilenceFrames: 2, minSpeechFrames: 1, strongThreshold: 0 });
const newCuts = decisionsFor(pausesFromSpeechSegments(newSegments, duration), 'tight', .5, {}, { duration, minPause: .064, padding: .01 });
const oldCuts = decisionsFor(pausesFromSpeechSegments(oldSegments, duration), 'tight', .5, {}, { duration, minPause: .064, padding: .01 });
const removedInGaps = cuts => gaps.map(gap => ({ ...gap, removed: cuts.flatMap(cut => { const start = Math.max(cut.start, gap.start), end = Math.min(cut.end, gap.end); return end > start ? [{ start, end }] : []; }) }));
const result = {
  generatedAt: new Date().toISOString(),
  source: 'public/demo/one-take.mp4',
  manifestDuration: manifest.duration,
  decodedDuration: duration,
  sourceSha256: createHash('sha256').update(Buffer.from(original.buffer)).digest('hex'),
  augmentedSha256: createHash('sha256').update(Buffer.from(augmented.buffer)).digest('hex'),
  injectedGaps: gaps,
  model: { id: 'onnx-community/silero-vad', revision: modelRevision, contextualInputSamples: 576, frameClockSamples: 512, contextSamples: 64 },
  newPolicy: { enter: .5, exit: .35, minSpeechFrames: 3, minSilenceFrames: 2, speechSegments: newSegments, scores: { min: Math.min(...newProbabilities), max: Math.max(...newProbabilities), mean: newProbabilities.reduce((sum, value) => sum + value, 0) / newProbabilities.length } },
  legacyPolicy: { enter: .3, exit: .08, minSpeechFrames: 1, minSilenceFrames: 2, speechSegments: oldSegments },
  speechCoverage: { expectedSeconds: unionDuration(speechRanges), newSeconds: coverage(newSegments, speechRanges), legacySeconds: coverage(oldSegments, speechRanges) },
  noiseFalsePositiveSeconds: { new: falsePositive(newSegments, gapRanges), legacy: falsePositive(oldSegments, gapRanges) },
  removedNoisyIntervals: { new: removedInGaps(newCuts), legacy: removedInGaps(oldCuts) },
  caveat: 'This is one synthetic-noise check on the bundled demo. It does not establish universal speech/noise classification accuracy.',
};
const output = new URL('../docs/evidence/speech-noise-check.json', import.meta.url);
await mkdir(new URL('../docs/evidence/', import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: output.pathname, duration, newSegments: newSegments.length, oldSegments: oldSegments.length, speechCoverage: result.speechCoverage, noiseFalsePositiveSeconds: result.noiseFalsePositiveSeconds, removedNoisyIntervals: result.removedNoisyIntervals }, null, 2));
