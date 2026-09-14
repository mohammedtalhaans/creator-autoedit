/// <reference lib="webworker" />
import { installVisionNetworkGuard } from './network-guard';
const scope = self as DedicatedWorkerGlobalScope;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let detector: import('@mediapipe/tasks-vision').FaceDetector | null = null;
let last = { x: .5, y: .37 };
scope.onmessage = async (e: MessageEvent<{
    type: 'init';
    base: string;
} | {
    type: 'frame';
    bitmap: ImageBitmap;
    time: number;
}>) => {
    try {
        if (e.data.type === 'init') {
            installVisionNetworkGuard(e.data.base, MODEL);
            const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
            const files = await FilesetResolver.forVisionTasks(new URL('runtime/vision/', e.data.base).href.replace(/\/$/, ''));
            detector = await FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: .6 });
            scope.postMessage({ type: 'ready' });
        }
        else {
            const { bitmap, time } = e.data;
            try {
                if (!detector)
                    throw new Error('Face analysis was not initialized.');
                const width = bitmap.width, height = bitmap.height;
                const detections = detector.detectForVideo(bitmap, Math.round(time * 1000)).detections;
                const choices = detections.flatMap(d => {
                    const b = d.boundingBox;
                    if (!b)
                        return [];
                    return [{ x: (b.originX + b.width / 2) / width, y: (b.originY + b.height * .42) / height, confidence: d.categories[0]?.score ?? 0 }];
                });
                choices.sort((a, b) => (Math.hypot(a.x - last.x, a.y - last.y) - a.confidence * .3) - (Math.hypot(b.x - last.x, b.y - last.y) - b.confidence * .3));
                const face = choices[0] ?? { ...last, confidence: 0 };
                if (face.confidence >= .6)
                    last = face;
                scope.postMessage({ type: 'point', point: { ...face, time } });
            }
            finally {
                bitmap.close();
            }
        }
    }
    catch (error) {
        scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
