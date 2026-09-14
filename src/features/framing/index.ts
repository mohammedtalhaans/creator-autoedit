import type { FacePoint, FramingConfig, Metadata } from '../../types/project';
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function dimensions(ratio: FramingConfig['ratio'], quality: 720 | 1080, meta: Pick<Metadata, 'width' | 'height'>): {
    width: number;
    height: number;
} {
    if (ratio === 'vertical')
        return { width: quality, height: quality === 1080 ? 1920 : 1280 };
    if (ratio === 'square')
        return { width: quality, height: quality };
    const scale = Math.min(1, (quality === 1080 ? 1920 : 1280) / Math.max(meta.width, meta.height));
    return { width: Math.max(2, Math.round(meta.width * scale / 2) * 2), height: Math.max(2, Math.round(meta.height * scale / 2) * 2) };
}
/** Offline trajectory: confidence gating, dead-zone, acceleration/velocity limits, no recenter snaps. */
export function smoothFaces(points: FacePoint[]): FacePoint[] {
    const result: FacePoint[] = [];
    let x = .5, y = .37, vx = 0, vy = 0, last = 0, locked = false;
    for (const p of [...points].sort((a, b) => a.time - b.time)) {
        const dt = clamp(p.time - last, .01, 1);
        last = p.time;
        if (p.confidence >= .6) {
            if (!locked) {
                x = p.x;
                y = p.y;
                locked = true;
            }
            const dx = Math.abs(p.x - x) < .025 ? 0 : p.x - x, dy = Math.abs(p.y - y) < .035 ? 0 : p.y - y;
            const targetVx = clamp(dx * 2, -.18, .18), targetVy = clamp(dy * 1.5, -.10, .10);
            vx += clamp(targetVx - vx, -.35 * dt, .35 * dt);
            vy += clamp(targetVy - vy, -.2 * dt, .2 * dt);
            x = clamp(x + vx * dt, 0, 1);
            y = clamp(y + vy * dt, 0, 1);
        }
        else {
            vx *= .5;
            vy *= .5;
        }
        result.push({ ...p, x, y });
    }
    return result;
}
export function faceAt(points: FacePoint[], time: number): {
    x: number;
    y: number;
} {
    if (!points.length)
        return { x: .5, y: .37 };
    if (time <= points[0].time)
        return points[0];
    let lo = 0, hi = points.length - 1;
    while (lo + 1 < hi) {
        const m = (lo + hi) >> 1;
        if (points[m].time <= time)
            lo = m;
        else
            hi = m;
    }
    const a = points[lo], b = points[hi], t = clamp((time - a.time) / Math.max(.001, b.time - a.time), 0, 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export function cropRect(sw: number, sh: number, dw: number, dh: number, config: FramingConfig, subject = { x: .5, y: .37 }, punch = 1) {
    const scale = Math.max(dw / sw, dh / sh) * config.zoom * punch;
    const cw = dw / scale, ch = dh / scale;
    const cx = config.mode === 'auto' ? subject.x : config.x;
    // Place a detected face at 37% of the output height instead of dead center.
    const top = config.mode === 'auto' ? subject.y * sh - ch * .37 : config.y * sh - ch / 2;
    return { x: clamp(cx * sw - cw / 2, 0, sw - cw), y: clamp(top, 0, sh - ch), width: cw, height: ch };
}

/** Translate screen-space drag into the cropped source's coordinate space.
 * This is ratio/zoom aware; a fixed multiplier makes wide footage feel slippery.
 */
export function dragCrop(sw: number, sh: number, dw: number, dh: number,
    config: FramingConfig, dx: number, dy: number, subject = { x: .5, y: .37 }) {
    if (![sw, sh, dw, dh].every(n => Number.isFinite(n) && n > 0)) return { x: config.x, y: config.y };
    const crop = cropRect(sw, sh, dw, dh, config, subject);
    const halfX = crop.width / (2 * sw), halfY = crop.height / (2 * sh);
    return {
        x: clamp((crop.x + crop.width / 2 - dx * crop.width / dw) / sw, halfX, 1 - halfX),
        y: clamp((crop.y + crop.height / 2 - dy * crop.height / dh) / sh, halfY, 1 - halfY),
    };
}
