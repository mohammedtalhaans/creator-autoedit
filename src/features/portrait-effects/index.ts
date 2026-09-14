import type { TaskState } from '../../types/project';

export type PortraitEffectsConfig = {
    backgroundBlur: number;
    skinSmoothing: number;
};
export type PortraitProcessorError = {
    code: string;
    message: string;
};
export type PortraitProcessor = {
    prepare(): Promise<void>;
    process(source: CanvasImageSource, width: number, height: number, config: PortraitEffectsConfig, timeMs: number): Promise<ImageBitmap>;
    dispose(): void;
};
type Pending = {
    id: number;
    bitmap: ImageBitmap;
    width: number;
    height: number;
    config: PortraitEffectsConfig;
    timeMs: number;
    resolve: (bitmap: ImageBitmap) => void;
    reject: (error: unknown) => void;
};
type WorkerReply = { type: 'ready' } | { type: 'frame'; id?: number; timeMs: number; bitmap: ImageBitmap } | { type: 'error'; code?: string; message: string };
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * A single-worker, latest-frame processor. Preview may request frames faster
 * than CPU segmentation can complete; an older queued frame is closed and
 * rejected so stale masks never paint over a newer frame. Export uses the same
 * processor sequentially and receives the processed bitmap before captions.
 */
export class LocalPortraitProcessor implements PortraitProcessor {
    private readonly worker = new Worker(new URL('../../workers/portrait.worker.ts', import.meta.url), { type: 'module' });
    private preparing: Promise<void> | null = null;
    private current: Pending | null = null;
    private queued: Pending | null = null;
    private sequence = 0;
    private disposed = false;
    private readonly waiters = new Set<{ resolve: () => void; reject: (error: unknown) => void }>();
    constructor(private readonly base = new URL(import.meta.env.BASE_URL, location.origin).href) {
        this.worker.onmessage = (event: MessageEvent<WorkerReply>) => this.reply(event.data);
        this.worker.onerror = event => this.fail(new Error(event.message || 'Portrait processing stopped unexpectedly.'));
    }
    prepare(): Promise<void> {
        if (this.disposed) return Promise.reject(new Error('Portrait processor has been disposed.'));
        if (this.preparing) return this.preparing;
        this.preparing = new Promise<void>((resolve, reject) => {
            this.waiters.add({ resolve, reject });
            try { this.worker.postMessage({ type: 'init', base: this.base }); }
            catch (error) { this.fail(error); }
        });
        return this.preparing;
    }
    process(source: CanvasImageSource, width: number, height: number, config: PortraitEffectsConfig, timeMs: number): Promise<ImageBitmap> {
        const options = { backgroundBlur: clamp(config.backgroundBlur), skinSmoothing: clamp(config.skinSmoothing) };
        if (!options.backgroundBlur && !options.skinSmoothing)
            return createImageBitmap(source);
        if (this.disposed)
            return Promise.reject(new Error('Portrait processor has been disposed.'));
        return createImageBitmap(source).then(bitmap => new Promise<ImageBitmap>((resolve, reject) => {
            const request: Pending = { id: ++this.sequence, bitmap, width, height, config: options, timeMs, resolve, reject };
            // Keep one in-flight and one latest queued request. Rejected requests
            // are explicit so preview callers can ignore a superseded frame.
            if (this.queued) {
                this.queued.bitmap.close();
                this.queued.reject(new DOMException('Superseded', 'AbortError'));
            }
            this.queued = request;
            void this.prepare().then(() => this.pump()).catch(error => reject(error));
        }));
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const error = new DOMException('Portrait processor disposed', 'AbortError');
        this.queued?.bitmap.close();
        this.queued?.reject(error);
        this.current?.bitmap.close();
        this.current?.reject(error);
        this.queued = this.current = null;
        for (const waiter of this.waiters) waiter.reject(error);
        this.waiters.clear();
        this.worker.postMessage({ type: 'dispose' });
        this.worker.terminate();
    }
    private pump(): void {
        if (this.disposed || this.current || !this.queued) return;
        this.current = this.queued;
        this.queued = null;
        const request = this.current;
        try {
            this.worker.postMessage({ type: 'frame', bitmap: request.bitmap, width: request.width, height: request.height, config: request.config, timeMs: request.timeMs, id: request.id }, [request.bitmap]);
        }
        catch (error) {
            request.bitmap.close();
            request.reject(error);
            this.current = null;
            this.pump();
        }
    }
    private reply(message: WorkerReply): void {
        if (!message || this.disposed) {
            if (message?.type === 'frame') message.bitmap.close();
            return;
        }
        if (message.type === 'ready') {
            for (const waiter of this.waiters) waiter.resolve();
            this.waiters.clear();
            return;
        }
        if (message.type === 'error') {
            this.fail({ code: message.code ?? 'portrait-processing', message: message.message });
            return;
        }
        const request = this.current;
        if (!request || (message.id !== undefined && message.id !== request.id)) {
            message.bitmap.close();
            return;
        }
        this.current = null;
        request.bitmap.close();
        request.resolve(message.bitmap);
        this.pump();
    }
    private fail(error: unknown): void {
        for (const waiter of this.waiters) waiter.reject(error);
        this.waiters.clear();
        this.preparing = null;
        const request = this.current;
        this.current = null;
        if (request) { request.bitmap.close(); request.reject(error); }
        const queued = this.queued;
        this.queued = null;
        if (queued) { queued.bitmap.close(); queued.reject(error); }
    }
}

export function createPortraitProcessor(base?: string): PortraitProcessor {
    return new LocalPortraitProcessor(base);
}

/** Shared progress shape for UI task rows that prepare the optional model. */
export function portraitProgress(detail: string, progress?: number): Partial<TaskState> {
    return { detail, progress };
}

