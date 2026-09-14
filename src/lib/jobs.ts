import type { TaskState } from '../types/project';
export type WorkerProgress = {
    type: 'progress';
    detail: string;
    progress?: number;
    loaded?: number;
    total?: number;
};
export type WorkerMessage<T> = WorkerProgress | {
    type: 'result';
    value: T;
} | {
    type: 'error';
    message: string;
};
/** One worker per cancellable media operation. */
export class Jobs {
    private active = new Map<string, AbortController>();
    start(name: string): AbortSignal { this.cancel(name); const c = new AbortController(); this.active.set(name, c); return c.signal; }
    cancel(name: string) { this.active.get(name)?.abort(); this.active.delete(name); }
    cancelAll() {
        for (const c of this.active.values())
            c.abort();
        this.active.clear();
    }
    finish(name: string, signal: AbortSignal) {
        if (this.active.get(name)?.signal === signal)
            this.active.delete(name);
    }
}
export function runWorker<T>(worker: Worker, payload: unknown, signal: AbortSignal, onProgress: (state: Partial<TaskState>) => void, transfer: Transferable[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
        let done = false;
        const cleanup = () => {
            done = true;
            signal.removeEventListener('abort', abort);
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
            worker.terminate();
        };
        const fail = (error: unknown) => {
            if (done) return;
            cleanup();
            reject(error);
        };
        const abort = () => fail(new DOMException('Cancelled', 'AbortError'));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        worker.onerror = event => {
            event.preventDefault?.();
            fail(new Error(event.message || 'This local processing task stopped unexpectedly.'));
        };
        worker.onmessageerror = () => fail(new Error('The processing worker could not return its result. Please retry.'));
        worker.onmessage = (event: MessageEvent<WorkerMessage<T>>) => {
            if (done) return;
            const message = event.data;
            if (!message || typeof message !== 'object' || !('type' in message)) {
                fail(new Error('The processing worker returned an invalid response.'));
                return;
            }
            try {
                if (message.type === 'progress') {
                    const p = message.progress;
                    onProgress({ detail: message.detail,
                        progress: typeof p === 'number' && Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : undefined,
                        loaded: message.loaded, total: message.total });
                } else if (message.type === 'result') {
                    cleanup();
                    resolve(message.value);
                } else if (message.type === 'error') {
                    fail(new Error(message.message || 'This local processing task could not finish.'));
                } else {
                    fail(new Error('The processing worker returned an unknown response.'));
                }
            } catch (error) { fail(error); }
        };
        try { worker.postMessage(payload, transfer); }
        catch (error) { fail(error); }
    });
}
