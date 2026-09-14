import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import type { Metadata, SourceMedia } from '../../types/project';
import { assertActive } from '../../lib/utils';
export async function inspectVideo(file: File, constrained: boolean, signal: AbortSignal): Promise<{
    source: SourceMedia;
    metadata: Metadata;
}> {
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm)$/i.test(file.name))
        throw new Error('Choose an MP4, MOV, or WebM video.');
    if (file.size > (constrained ? 350 : 1024) * 1024 * 1024)
        throw new Error(`This video is too large for safe local editing on this device. Choose a file under ${constrained ? '350 MB' : '1 GB'}, or trim it first.`);
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const cancel = () => input.dispose();
    signal.addEventListener('abort', cancel, { once: true });
    let thumbnail = '';
    try {
        assertActive(signal);
        const video = await input.getPrimaryVideoTrack();
        if (!video || !(await video.canDecode()))
            throw new Error('This video format isn’t supported on this device. Try exporting it as H.264 MP4 first.');
        const audio = await input.getPrimaryAudioTrack();
        if (audio && !(await audio.canDecode()))
            throw new Error('The audio codec in this video cannot be decoded on this device. Convert it to an MP4 with AAC audio first.');
        const duration = await input.computeDuration();
        if (!Number.isFinite(duration) || duration < .1)
            throw new Error('This file does not contain a playable video. It may be damaged.');
        if (duration > 300.1)
            throw new Error('This video is over 5 minutes. Trim it first; clips under 3 minutes work best.');
        const [width, height, videoCodec, audioCodec] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight(), video.getCodec(), audio?.getCodec() ?? null]);
        const hdr = await video.hasHighDynamicRange();
        const packetStats = await video.computePacketStats(100);
        const fps = packetStats.averagePacketRate;
        // Deliberately fail closed until cross-browser HDR -> SDR tonemapping is verified.
        if (hdr)
            throw new Error('This is an HDR video. For reliable colour, export an SDR / “Most Compatible” H.264 copy first. HDR tone mapping is not yet verified.');
        const sink = new CanvasSink(video, { width: 480, poolSize: 1 });
        const shot = await sink.getCanvas(Math.min(.1, duration / 2));
        if (shot) {
            const canvas = document.createElement('canvas');
            canvas.width = shot.canvas.width;
            canvas.height = shot.canvas.height;
            canvas.getContext('2d')!.drawImage(shot.canvas, 0, 0);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
            if (blob)
                thumbnail = URL.createObjectURL(blob);
            canvas.width = canvas.height = 1;
        }
        assertActive(signal);
        return { source: { file, name: file.name, url: URL.createObjectURL(file), thumbnail }, metadata: { duration, width, height, size: file.size, videoCodec: videoCodec ?? 'unknown', audioCodec, hasAudio: !!audio, fps: Number.isFinite(fps) ? fps : 0, hdr } };
    }
    catch (error) {
        if (thumbnail)
            URL.revokeObjectURL(thumbnail);
        throw error;
    }
    finally {
        signal.removeEventListener('abort', cancel);
        input.dispose();
    }
}
