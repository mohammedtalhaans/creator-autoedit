import type { Project, Phrase, CaptionConfig, AppearanceLook } from '../../types/project';
import { EditMap } from '../edit-map';
import { activePhrase, captionY, normalizeCaptionConfig } from '../captions';
import { cropRect, faceAt } from '../framing';
export type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const FONTS = { studio: '"DM Sans Variable", sans-serif', condensed: '"Barlow Condensed", sans-serif', mono: '"JetBrains Mono Variable", monospace' };
export type CaptionLayout = {
    lines: {
        text: string;
        id: string;
        start: number;
        end: number;
        width: number;
    }[][];
    size: number;
    lineHeight: number;
    widths: number[];
    height: number;
    left: number;
    right: number;
    maxLines: number;
    spacing: number;
};
const textWidth = (ctx: Context, text: string, letterSpacing: number) => Math.max(0, ctx.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing);
const fontFor = (c: CaptionConfig, size: number) => `${c.italic ? 'italic ' : ''}${c.fontWeight ?? 800} ${size}px ${FONTS[c.font]}`;
/** Shared text measurement; preview and export never use separate DOM caption layouts. */
export function layoutCaption(ctx: Context, phrase: Phrase, c: CaptionConfig, width: number, height = Infinity): CaptionLayout {
    c = normalizeCaptionConfig(c);
    const left = c.safe.left * width, right = (1 - c.safe.right) * width;
    const max = Math.max(1, right - left - (c.outlineWidth ?? 0) * 2);
    const maxLines = c.maxLines ?? 2;
    let size = Math.max(8, Math.min(width * .069 * c.size, height * Math.max(.1, 1 - c.safe.top - c.safe.bottom) / (maxLines * 1.2 + .25)));
    let lines: CaptionLayout['lines'] = [];
    let widest = Infinity;
    for (let attempt = 0; attempt < 120; attempt++) {
        ctx.font = fontFor(c, size);
        const gap = ctx.measureText(' ').width;
        lines = [[]];
        let lineWidth = 0;
        for (const word of phrase.words) {
            const text = c.uppercase ? word.text.toUpperCase() : word.text;
            const item = { ...word, text, width: textWidth(ctx, text, c.letterSpacing ?? 0) };
            if (lines.at(-1)!.length && lineWidth + gap + item.width > max) {
                lines.push([]);
                lineWidth = 0;
            }
            lines.at(-1)!.push(item);
            lineWidth += (lineWidth ? gap + (c.letterSpacing ?? 0) : 0) + item.width;
        }
        widest = Math.max(0, ...lines.map(line => line.reduce((n, w) => n + w.width, 0) + Math.max(0, line.length - 1) * (gap + (c.letterSpacing ?? 0))));
        if ((lines.length <= maxLines && widest <= max) || attempt === 119)
            break;
        size = Math.max(8, size * .91);
    }
    // If the readable minimum size still leaves more rows than requested, pack
    // the measured words into the exact line budget and scale the rows together.
    if (lines.length > maxLines) {
        const all = lines.flat();
        lines = Array.from({ length: maxLines }, () => [] as CaptionLayout['lines'][number]);
        all.forEach((word, index) => lines[Math.min(maxLines - 1, Math.floor(index * maxLines / Math.max(1, all.length)))].push(word));
    }
    const finalGap = ctx.measureText(' ').width + (c.letterSpacing ?? 0);
    widest = Math.max(0, ...lines.map(line => line.reduce((n, w) => n + w.width, 0) + Math.max(0, line.length - 1) * finalGap));
    // A single very long corrected word may still exceed the safe width at the
    // readable minimum size. Scale that complete layout down so it can never be
    // clipped by the canvas edge.
    const fit = widest > max ? Math.min(1, max / widest) : 1;
    const gap = finalGap, lineHeight = size * (1.2 + (c.lineGap ?? .12));
    const widths = lines.map(line => (line.reduce((n, w) => n + w.width, 0) + Math.max(0, line.length - 1) * gap) * fit);
    if (fit < 1)
        lines = lines.map(line => line.map(w => ({ ...w, width: w.width * fit })));
    ctx.font = fontFor(c, size * fit);
    return { lines, size: size * fit, lineHeight: lineHeight * fit, widths, height: lines.length * lineHeight * fit, left, right, maxLines, spacing: (c.letterSpacing ?? 0) * fit };
}
function rounded(ctx: Context, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function luminance(color: string): number {
    const match = color.trim().match(/^#([0-9a-f]{3,8})$/i);
    if (!match) return .08;
    const value = match[1].length === 3 ? match[1].split('').map(c => parseInt(c + c, 16)) : [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
    const linear = value.map(channel => { const s = channel / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
function outlineFor(fill: string, outline: string): string {
    const a = luminance(fill), b = luminance(outline), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (ratio >= 1.35) return outline;
    return a > .5 ? '#101010' : '#f7f7f5';
}
/** Canvas has no portable letter-spacing property, so draw each word with the same
 * measured spacing in both preview and export. */
function drawText(ctx: Context, text: string, x: number, y: number, spacing: number, stroke: boolean) {
    let at = x;
    for (const char of text) {
        if (stroke)
            ctx.strokeText(char, at, y);
        else
            ctx.fillText(char, at, y);
        at += ctx.measureText(char).width + spacing;
    }
}
export function drawCaptions(ctx: Context, phrases: Phrase[], time: number, c: CaptionConfig, width: number, height: number) {
    c = normalizeCaptionConfig(c);
    if (!c.enabled)
        return;
    const phrase = activePhrase(phrases, time);
    if (!phrase)
        return;
    ctx.save();
    const layout = layoutCaption(ctx, phrase, c, width, height), y = captionY(c, layout.height, height);
    // layoutCaption may reduce the font to keep a long corrected word inside the
    // safe area; drawing uses that exact final size too.
    ctx.font = fontFor(c, layout.size);
    const enter = clamp((time - phrase.start) / .15, 0, 1), leave = clamp((phrase.end - time) / .08, 0, 1);
    const ease = 1 - Math.pow(1 - enter, 3);
    let scale = 1, offset = 0;
    if (c.animation === 'pop') {
        scale = .94 + .06 * ease + .012 * Math.sin(enter * Math.PI);
        ctx.globalAlpha = Math.min(1, enter * 4, leave * 4);
    }
    else if (c.animation === 'smooth') {
        offset = (1 - ease) * height * .009;
        ctx.globalAlpha = Math.min(ease, leave);
    }
    const center = (layout.left + layout.right) / 2;
    ctx.translate(center, y + offset);
    ctx.scale(scale, scale);
    ctx.translate(-center, -y);
    const gap = ctx.measureText(' ').width + layout.spacing;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (c.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,.7)';
        ctx.shadowBlur = width * .01;
        ctx.shadowOffsetY = width * .003;
    }
    for (let i = 0; i < layout.lines.length; i++) {
        const row = layout.lines[i], rowWidth = layout.widths[i], rowY = y - layout.height / 2 + layout.lineHeight * (i + .5);
        let x = c.align === 'left' ? layout.left : c.align === 'right' ? layout.right - rowWidth : center - rowWidth / 2;
        if (c.background) {
            const oldAlpha = ctx.globalAlpha;
            ctx.globalAlpha *= c.opacity;
            ctx.fillStyle = c.backgroundColor ?? '#08090a';
            rounded(ctx, x - layout.size * .24, rowY - layout.lineHeight * .51, rowWidth + layout.size * .48, layout.lineHeight * 1.02, Math.min(c.cornerRadius ?? 8, layout.lineHeight * .45));
            ctx.globalAlpha = oldAlpha;
        }
        for (const w of row) {
            const active = time >= w.start && time < w.end;
            ctx.fillStyle = c.highlight && active ? c.accent : c.color;
            // Word activation is deliberately typographic, not a per-word bounce.
            const alpha = ctx.globalAlpha;
            if (c.animation === 'word' && time < w.start)
                ctx.globalAlpha *= .78;
            const outline = c.outlineWidth ?? 0;
            if (outline > 0) {
                ctx.lineWidth = outline;
                ctx.lineJoin = 'round';
                ctx.strokeStyle = outlineFor(c.highlight && active ? c.accent : c.color, c.outlineColor ?? '#101010');
                drawText(ctx, w.text, x, rowY, layout.spacing, true);
            }
            drawText(ctx, w.text, x, rowY, layout.spacing, false);
            ctx.globalAlpha = alpha;
            x += w.width + gap;
        }
    }
    ctx.restore();
}
const appearanceFilter = (look: AppearanceLook, intensity: number) => {
    const i = clamp(intensity, 0, 1);
    if (look === 'soft') return `saturate(${1 - .18 * i}) contrast(${1 - .08 * i}) brightness(${1 + .035 * i})`;
    if (look === 'vivid') return `saturate(${1 + .45 * i}) contrast(${1 + .12 * i})`;
    if (look === 'warm') return `sepia(${.22 * i}) saturate(${1 + .18 * i}) brightness(${1 + .025 * i})`;
    if (look === 'mono') return `grayscale(${i}) contrast(${1 + .08 * i})`;
    if (look === 'cool') return `saturate(${1 + .12 * i}) hue-rotate(${(-9 * i).toFixed(2)}deg) brightness(${1 + .015 * i})`;
    return 'none';
};
function appearanceOverlay(ctx: Context, look: AppearanceLook, intensity: number, width: number, height: number) {
    const i = clamp(intensity, 0, 1);
    if (!i || look === 'natural') return;
    ctx.save();
    ctx.globalAlpha = .14 * i;
    ctx.globalCompositeOperation = look === 'mono' ? 'saturation' : 'screen';
    ctx.fillStyle = look === 'warm' ? '#f0a85f' : look === 'cool' ? '#70b7e8' : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}
export function renderFrame(ctx: Context, image: CanvasImageSource, sw: number, sh: number, width: number, height: number, project: Project, map: EditMap, phrases: Phrase[], sourceTime: number, raw = false) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, width, height);
    const f = project.framing;
    const appearance = project.appearance ?? (project.recording?.look && ['natural', 'soft', 'vivid', 'warm', 'mono', 'cool'].includes(project.recording.look) ? { look: project.recording.look as AppearanceLook, intensity: project.recording.lookIntensity ?? 1 } : undefined);
    let gradeApplied = false;
    const gradeStyle = appearance && appearance.look !== 'natural' ? appearanceFilter(appearance.look, appearance.intensity) : 'none';
    if (!raw && appearance && appearance.look !== 'natural' && appearance.intensity > 0) {
        try {
            ctx.filter = gradeStyle;
            gradeApplied = true;
        }
        catch {
            // Older canvas implementations may expose no usable filter setter.
            gradeApplied = false;
        }
    }
    if (raw || f.mode === 'fit' || f.mode === 'blur') {
        if (!raw && f.mode === 'blur') {
            // Blur only the low-frequency background; no CSS filter over the live UI.
            const scale = Math.max(width / sw, height / sh) * 1.1;
            ctx.filter = `${gradeApplied ? gradeStyle : 'none'} blur(${width * .035}px)`;
            ctx.drawImage(image, (width - sw * scale) / 2, (height - sh * scale) / 2, sw * scale, sh * scale);
            ctx.filter = gradeApplied ? gradeStyle : 'none';
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.fillRect(0, 0, width, height);
        }
        const scale = Math.min(width / sw, height / sh);
        ctx.drawImage(image, (width - sw * scale) / 2, (height - sh * scale) / 2, sw * scale, sh * scale);
    }
    else {
        const index = map.rangeAtSource(sourceTime), punch = f.punch && index > 0 && index % 3 === 1 ? 1.035 : 1;
        const crop = cropRect(sw, sh, width, height, f, faceAt(project.faces, sourceTime), punch);
        ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    }
    if (gradeApplied)
        ctx.filter = 'none';
    if (!raw && appearance && !gradeApplied)
        appearanceOverlay(ctx, appearance.look, appearance.intensity, width, height);
    if (!raw)
        drawCaptions(ctx, phrases, map.sourceTimeToOutputTime(sourceTime), project.captions, width, height);
    ctx.restore();
}
export async function prepareFonts() {
    await Promise.all([
        document.fonts.load('800 48px "DM Sans Variable"'),
        document.fonts.load('800 48px "Barlow Condensed"'),
        document.fonts.load('800 48px "JetBrains Mono Variable"'),
    ]);
    await document.fonts.ready;
    if (!document.fonts.check('800 48px "DM Sans Variable"'))
        throw new Error('The caption font did not load. Reload the app before exporting.');
}
