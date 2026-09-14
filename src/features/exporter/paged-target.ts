/** Random-access in-memory file: StreamTarget may rewrite prior byte positions.
 * Bounded pages avoid the doubling reallocations of a contiguous growing buffer. */
export class PagedFile {
    private pages = new Map<number, Uint8Array<ArrayBuffer>>();
    length = 0;
    constructor(readonly limit = 128 * 1024 * 1024, readonly pageSize = 1024 * 1024) {
        if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(pageSize) || pageSize <= 0)
            throw new Error('Invalid export buffer budget.');
    }
    write(data: Uint8Array, position: number) {
        if (!Number.isSafeInteger(position) || position < 0)
            throw new Error('Invalid MP4 write offset.');
        if (position + data.length > this.limit)
            throw new Error('The export exceeded this device’s memory budget. Choose Standard 720p or a shorter clip.');
        for (let read = 0; read < data.length;) {
            const at = position + read, page = Math.floor(at / this.pageSize), offset = at % this.pageSize;
            let buffer = this.pages.get(page);
            if (!buffer) {
                buffer = new Uint8Array(this.pageSize);
                this.pages.set(page, buffer);
            }
            const count = Math.min(data.length - read, this.pageSize - offset);
            buffer.set(data.subarray(read, read + count), offset);
            read += count;
        }
        this.length = Math.max(this.length, position + data.length);
    }
    blob(): Blob {
        const parts: BlobPart[] = [];
        for (let i = 0; i < Math.ceil(this.length / this.pageSize); i++) {
            const page = this.pages.get(i) ?? new Uint8Array(this.pageSize);
            parts.push(page.subarray(0, Math.min(this.pageSize, this.length - i * this.pageSize)));
        }
        return new Blob(parts, { type: 'video/mp4' });
    }
    clear() { this.pages.clear(); this.length = 0; }
}
