/// <reference lib="webworker" />
import { Input, BlobSource, ALL_FORMATS, AudioSampleSink } from 'mediabunny';
import { analyzeSignal } from '../features/silence';
import { AUDIO_RATE, resample, signalStats } from '../features/audio-enhance/dsp';
import { AudioTimeline } from '../features/media/audio-timeline';
const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<{
    file: File;
    duration: number;
}>) => {
    const input = new Input({ source: new BlobSource(e.data.file), formats: ALL_FORMATS });
    try {
        const track = await input.getPrimaryAudioTrack();
        if (!track)
            throw new Error('No audio track.');
        const sink = new AudioSampleSink(track), duration = e.data.duration;
        const timeline = new AudioTimeline(duration, AUDIO_RATE);
        let lastReport = 0;
        for await (const sample of sink.samples()) {
            try {
                const mono = new Float32Array(sample.numberOfFrames), plane = new Float32Array(sample.numberOfFrames);
                for (let c = 0; c < sample.numberOfChannels; c++) {
                    sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
                    for (let i = 0; i < mono.length; i++)
                        mono[i] += plane[i] / sample.numberOfChannels;
                }
                timeline.push(mono, sample.timestamp, sample.sampleRate);
                if (sample.timestamp - lastReport > .3) {
                    lastReport = sample.timestamp;
                    scope.postMessage({ type: 'progress', detail: 'Reading your audio', progress: Math.min(1, sample.timestamp / duration) });
                }
            }
            finally {
                sample.close();
            }
        }
        if (!timeline.decodedFrames) throw new Error('The audio track could not be decoded. Try an H.264 MP4 with AAC audio.');
        const pcm = timeline.finish();
        scope.postMessage({ type: 'progress', detail: 'Finding the dead air' });
        const { waveform, pauses } = analyzeSignal(pcm, AUDIO_RATE);
        scope.postMessage({ type: 'progress', detail: 'Preparing speech audio' });
        const speech = resample(pcm, AUDIO_RATE, 16000);
        scope.postMessage({ type: 'result', value: { pcm, speech, waveform, pauses, sourceStats: signalStats(pcm) } }, [pcm.buffer, speech.buffer]);
    }
    catch (error) {
        scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    finally {
        input.dispose();
    }
};
