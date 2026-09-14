import { describe, it, expect } from 'vitest';
import { PagedFile } from './paged-target';
describe('bounded random-access MP4 target', () => {
    it('writes across page boundaries', async () => { const f = new PagedFile(100, 4); f.write(new Uint8Array([1, 2, 3, 4, 5, 6]), 0); expect(Array.from(new Uint8Array(await f.blob().arrayBuffer()))).toEqual([1, 2, 3, 4, 5, 6]); });
    it('rewrites MP4 header bytes without appending duplicates', async () => { const f = new PagedFile(100, 4); f.write(new Uint8Array([1, 2, 3, 4, 5, 6]), 0); f.write(new Uint8Array([9, 8, 7]), 2); expect(Array.from(new Uint8Array(await f.blob().arrayBuffer()))).toEqual([1, 2, 9, 8, 7, 6]); });
    it('fills unwritten sparse ranges with zero', async () => { const f = new PagedFile(100, 4); f.write(new Uint8Array([7]), 8); expect(Array.from(new Uint8Array(await f.blob().arrayBuffer()))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 7]); });
    it('rejects memory budget overruns before allocation', () => { const f = new PagedFile(4, 4); expect(() => f.write(new Uint8Array(5), 0)).toThrow(); expect(f.length).toBe(0); });
    it('rejects invalid positions and configurations', () => { expect(() => new PagedFile(0)).toThrow(); expect(() => new PagedFile(100, 0)).toThrow(); expect(() => new PagedFile().write(new Uint8Array(1), -.1)).toThrow(); });
    it('releases all pages and reports the actual length', () => { const f = new PagedFile(); f.write(new Uint8Array(19), 0); expect(f.length).toBe(19); f.clear(); expect(f.blob().size).toBe(0); });
});
