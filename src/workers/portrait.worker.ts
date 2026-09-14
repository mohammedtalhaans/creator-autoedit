/// <reference lib="webworker" />

/**
 * Optional portrait processing worker. MediaPipe's selfie multiclass model
 * exposes a category mask; category 0 is background and categories 2/3 are
 * body/face skin. The model is CPU-only because the ImageSegmenter GPU path has
 * a known category-mask issue on some iOS builds.
 */
import { installVisionNetworkGuard } from './network-guard';

const scope = self as DedicatedWorkerGlobalScope;
export const PORTRAIT_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
export const PORTRAIT_MODEL_SHA256 = 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0';
const CACHE_NAME = 'creator-autoedit-portrait-model-v1';
let segmenter: import('@mediapipe/tasks-vision').ImageSegmenter | null = null;
let preparing: Promise<void> | null = null;

type Effects = { backgroundBlur: number; skinSmoothing: number };
type FrameMessage = { type: 'frame'; id: number; bitmap: ImageBitmap; width: number; height: number; config: Effects; timeMs: number };

function clamp(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
async function verifiedModel(): Promise<Uint8Array> {
    let response: Response | undefined;
    try {
        const cache = await caches.open(CACHE_NAME);
        response = await cache.match(PORTRAIT_MODEL);
        if (!response) {
            const fetched = await fetch(PORTRAIT_MODEL);
            if (!fetched.ok) throw new Error(`Portrait model request failed (${fetched.status}).`);
            response = fetched.clone();
            await cache.put(PORTRAIT_MODEL, response);
            response = fetched;
        }
    }
    catch (error) {
        if (error instanceof Error && /Portrait model request failed/.test(error.message)) throw error;
        const fetched = await fetch(PORTRAIT_MODEL);
        if (!fetched.ok) throw new Error(`Portrait model request failed (${fetched.status}).`);
        response = fetched;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== PORTRAIT_MODEL_SHA256)
        throw new Error('Portrait model checksum did not match the pinned version.');
    return bytes;
}

async function prepare(base: string): Promise<void> {
    if (preparing) return preparing;
    preparing = (async () => {
        installVisionNetworkGuard(base, PORTRAIT_MODEL);
        const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
        const [files, model] = await Promise.all([
            FilesetResolver.forVisionTasks(new URL('runtime/vision/', base).href.replace(/\/$/, '')),
            verifiedModel(),
        ]);
        segmenter = await ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
            runningMode: 'IMAGE',
            outputCategoryMask: true,
            outputConfidenceMasks: false,
        });
    })();
    try { await preparing; }
    catch (error) { preparing = null; segmenter?.close(); segmenter = null; throw error; }
}

function makeMask(category: Uint8Array, maskWidth: number, maskHeight: number, keep: (value: number) => boolean): OffscreenCanvas {
    const canvas = new OffscreenCanvas(maskWidth, maskHeight), ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Portrait mask canvas is unavailable.');
    const image = ctx.createImageData(maskWidth, maskHeight);
    for (let i = 0; i < category.length; i++) {
        const alpha = keep(category[i]) ? 255 : 0;
        image.data[i * 4] = 255;
        image.data[i * 4 + 1] = 255;
        image.data[i * 4 + 2] = 255;
        image.data[i * 4 + 3] = alpha;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

function drawBlurred(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, radius: number, width: number, height: number): void {
    if (radius <= .01) { ctx.drawImage(source, 0, 0, width, height); return; }
    try {
        ctx.filter = `blur(${radius.toFixed(2)}px)`;
        ctx.drawImage(source, -radius, -radius, width + radius * 2, height + radius * 2);
        ctx.filter = 'none';
    }
    catch {
        // A small multi-pass spread is a real fallback for canvases without
        // CanvasFilter support; it is intentionally bounded for phone CPUs.
        ctx.filter = 'none';
        const spread = Math.min(8, Math.max(1, Math.round(radius / 3)));
        ctx.globalAlpha = .2;
        for (let y = -spread; y <= spread; y += spread)
            for (let x = -spread; x <= spread; x += spread)
                ctx.drawImage(source, x, y, width, height);
        ctx.globalAlpha = 1;
    }
}

function applyMask(target: OffscreenCanvasRenderingContext2D, source: ImageBitmap, mask: OffscreenCanvas, width: number, height: number, radius: number): void {
    const layer = new OffscreenCanvas(width, height), layerCtx = layer.getContext('2d');
    if (!layerCtx) throw new Error('Portrait effect layer is unavailable.');
    drawBlurred(layerCtx, source, radius, width, height);
    const scaledMask = new OffscreenCanvas(width, height), maskCtx = scaledMask.getContext('2d');
    if (!maskCtx) throw new Error('Portrait effect mask is unavailable.');
    maskCtx.imageSmoothingEnabled = true;
    try {
        maskCtx.filter = 'blur(1px)';
        maskCtx.drawImage(mask, 0, 0, width, height);
        maskCtx.filter = 'none';
    }
    catch {
        maskCtx.drawImage(mask, 0, 0, width, height);
    }
    layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.drawImage(scaledMask, 0, 0);
    target.drawImage(layer, 0, 0);
}

async function process(bitmap: ImageBitmap, width: number, height: number, config: Effects): Promise<ImageBitmap> {
    if (!segmenter) throw new Error('Portrait effects were not prepared.');
    const result = segmenter.segment(bitmap);
    const categoryMask = result.categoryMask;
    if (!categoryMask) { result.close(); throw new Error('Portrait segmentation returned no category mask.'); }
    const categories = categoryMask.getAsUint8Array();
    const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
    if (!ctx) { result.close(); throw new Error('Portrait output canvas is unavailable.'); }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const backgroundBlur = clamp(config.backgroundBlur), skinSmoothing = clamp(config.skinSmoothing);
    if (backgroundBlur > 0) {
        applyMask(ctx, bitmap, makeMask(categories, categoryMask.width, categoryMask.height, value => value === 0), width, height, Math.max(1, Math.min(42, Math.min(width, height) * .035 * backgroundBlur)));
    }
    if (skinSmoothing > 0) {
        applyMask(ctx, bitmap, makeMask(categories, categoryMask.width, categoryMask.height, value => value === 2 || value === 3), width, height, Math.max(1, Math.min(7, 2 + 4 * skinSmoothing)));
    }
    result.close();
    return createImageBitmap(canvas);
}

scope.onmessage = async (event: MessageEvent<{ type: 'init'; base: string } | FrameMessage | { type: 'dispose' }>) => {
    const data = event.data;
    try {
        if (data.type === 'init') {
            await prepare(data.base);
            scope.postMessage({ type: 'ready' });
        }
        else if (data.type === 'frame') {
            let output: ImageBitmap | null = null;
            try {
                output = await process(data.bitmap, data.width, data.height, data.config);
                scope.postMessage({ type: 'frame', id: data.id, timeMs: data.timeMs, bitmap: output }, [output]);
                output = null;
            }
            finally {
                data.bitmap.close();
                output?.close();
            }
        }
        else if (data.type === 'dispose') {
            segmenter?.close();
            segmenter = null;
            self.close();
        }
    }
    catch (error) {
        if (data.type === 'frame') data.bitmap.close();
        scope.postMessage({ type: 'error', code: 'portrait-processing', message: error instanceof Error ? error.message : String(error) });
    }
};
