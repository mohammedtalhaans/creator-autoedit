import { describe, expect, it } from 'vitest';
import { Jobs, runWorker } from './jobs';
class WorkerFixture {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = 0;
    posts = 0;
    throws = false;
    postMessage() { this.posts++; if (this.throws) throw new Error('Transfer failed'); }
    terminate() { this.terminated++; }
    send(data: unknown) { this.onmessage?.({ data }); }
    asWorker() { return this as unknown as Worker; }
}
async function rejected(promise: Promise<unknown>): Promise<string> {
    try { await promise; return 'UNEXPECTED_SUCCESS'; }
    catch (e) { return e instanceof Error ? e.message : String(e); }
}
describe('Cancellable worker ownership', () => {
    it('aborts the previous operation with the same name', () => {
        const jobs = new Jobs(), old = jobs.start('voice'), current = jobs.start('voice');
        expect(old.aborted).toBe(true); expect(current.aborted).toBe(false);
    });
    it('cannot finish a newer operation with an older signal', () => {
        const jobs = new Jobs(), old = jobs.start('face'), current = jobs.start('face');
        jobs.finish('face', old); jobs.cancel('face'); expect(current.aborted).toBe(true);
    });
    it('cancels all independent jobs', () => {
        const jobs = new Jobs(), a = jobs.start('audio'), b = jobs.start('captions');
        jobs.cancelAll(); expect(a.aborted && b.aborted).toBe(true);
    });
    it('terminates exactly once on success and detaches callbacks', async () => {
        const worker = new WorkerFixture(), controller = new AbortController();
        const result = runWorker<number>(worker.asWorker(), {}, controller.signal, () => {});
        worker.send({ type: 'result', value: 12 }); controller.abort();
        expect(await result).toBe(12); expect(worker.terminated).toBe(1);
        expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull(); expect(worker.onmessageerror).toBeNull();
    });
    it('does not post data to an already cancelled worker', async () => {
        const worker = new WorkerFixture(), controller = new AbortController(); controller.abort();
        expect(await rejected(runWorker(worker.asWorker(), {}, controller.signal, () => {}))).toBe('Cancelled');
        expect(worker.posts).toBe(0); expect(worker.terminated).toBe(1);
    });
    it('terminates actual work when cancellation arrives later', async () => {
        const worker = new WorkerFixture(), controller = new AbortController();
        const result = runWorker(worker.asWorker(), {}, controller.signal, () => {}); controller.abort();
        expect(await rejected(result)).toBe('Cancelled'); expect(worker.terminated).toBe(1);
    });
    it('propagates worker errors without leaking handlers', async () => {
        const worker = new WorkerFixture(); const result = runWorker(worker.asWorker(), {}, new AbortController().signal, () => {});
        worker.onerror?.({ message: 'Out of memory' });
        expect(await rejected(result)).toBe('Out of memory'); expect(worker.terminated).toBe(1);
    });
    it('handles data-clone failures on send', async () => {
        const worker = new WorkerFixture(); worker.throws = true;
        expect(await rejected(runWorker(worker.asWorker(), {}, new AbortController().signal, () => {}))).toBe('Transfer failed');
        expect(worker.terminated).toBe(1);
    });
    it('handles data-clone failures on receive', async () => {
        const worker = new WorkerFixture(); const result = runWorker(worker.asWorker(), {}, new AbortController().signal, () => {});
        worker.onmessageerror?.();
        expect(await rejected(result)).toBe('The processing worker could not return its result. Please retry.');
        expect(worker.terminated).toBe(1);
    });
    it('fails safely on malformed responses instead of hanging', async () => {
        const worker = new WorkerFixture(); const result = runWorker(worker.asWorker(), {}, new AbortController().signal, () => {});
        worker.send(null); expect(await rejected(result)).toBe('The processing worker returned an invalid response.');
    });
    it('reports only finite bounded measured progress', async () => {
        const worker = new WorkerFixture(); const values: unknown[] = [];
        const result = runWorker(worker.asWorker(), {}, new AbortController().signal, s => values.push(s.progress));
        worker.send({ type: 'progress', progress: .25 }); worker.send({ type: 'progress', progress: NaN });
        worker.send({ type: 'progress', progress: 2 }); worker.send({ type: 'result', value: true });
        await result; expect(values).toEqual([.25, undefined, 1]);
    });
});
