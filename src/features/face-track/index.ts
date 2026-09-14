import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import { smoothFaces } from '../framing';
import { assertActive } from '../../lib/utils';
import type { FacePoint, TaskState } from '../../types/project';
export async function trackFaces(file: File, duration: number, signal: AbortSignal, onProgress: (s: Partial<TaskState>) => void): Promise<FacePoint[]> {
    if (typeof OffscreenCanvas === 'undefined')
        throw new Error('Automatic framing is unavailable here. Drag to frame your video manually.');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const worker = new Worker(new URL('../../workers/face.worker.ts', import.meta.url), { type: 'module' });
    type Reply = {
        type: 'ready' | 'point' | 'error';
        point?: FacePoint;
        message?: string;
    };
    const exchange = (payload: unknown, transfer: Transferable[] = []) => new Promise<Reply>((resolve, reject) => {
        const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
        const cleanup = () => { signal.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; };
        if (signal.aborted) {
            abort();
            return;
        }
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = (e: MessageEvent<Reply>) => {
            cleanup();
            if (e.data.type === 'error')
                reject(new Error(e.data.message));
            else
                resolve(e.data);
        };
        worker.onerror = e => { cleanup(); reject(new Error(e.message)); };
        try {
            worker.postMessage(payload, transfer);
        }
        catch (error) {
            cleanup();
            reject(error);
        }
    });
    const abort = () => { worker.terminate(); input.dispose(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        onProgress({ detail: 'Preparing local face detection' });
        await exchange({ type: 'init', base: new URL(import.meta.env.BASE_URL, location.origin).href });
        const track = await input.getPrimaryVideoTrack();
        if (!track)
            throw new Error('No video track.');
        const sink = new CanvasSink(track, { width: 320, poolSize: 1 });
        const times = Array.from({ length: Math.ceil(duration * 2) }, (_, i) => i / 2);
        const points: FacePoint[] = [];
        let index = 0;
        for await (const frame of sink.canvasesAtTimestamps(times)) {
            assertActive(signal);
            const time = times[index++];
            if (!frame)
                continue;
            const bitmap = await createImageBitmap(frame.canvas);
            let reply: Reply;
            try {
                reply = await exchange({ type: 'frame', bitmap, time }, [bitmap]);
            }
            finally {
                bitmap.close();
            }
            if (reply.point)
                points.push(reply.point);
            onProgress({ detail: 'Finding your best frame', progress: index / times.length });
        }
        if (!points.some(p => p.confidence >= .6))
            throw new Error('No clear face found. Center framing is ready; you can adjust it by hand.');
        return smoothFaces(points);
    }
    finally {
        signal.removeEventListener('abort', abort);
        worker.terminate();
        input.dispose();
    }
}
