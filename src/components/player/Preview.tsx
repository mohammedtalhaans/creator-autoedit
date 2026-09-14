import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import type { Project, Module, FramingConfig, CaptionConfig } from '../../types/project';
import { EditMap } from '../../features/edit-map';
import { outputPhrases } from '../../features/captions';
import { dimensions, dragCrop } from '../../features/framing';
import { renderFrame, prepareFonts } from '../../features/renderer';
import { studio } from '../../app/store';
import { cn } from '../../lib/utils';

export type PreviewHandle = { toggle: () => void; pause: () => void; seek: (outputTime: number) => void; seekSource: (sourceTime: number) => void };
type Props = {
    project: Project;
    map: EditMap;
    raw: boolean;
    module: Module;
    guides: boolean;
    onTime: (time: number, playing: boolean, level: number) => void;
    onFrameChange: (framing: Partial<FramingConfig>) => void;
    onCaptionChange: (caption: Partial<CaptionConfig>) => void;
    onInteract: () => void;
};

export const Preview = forwardRef<PreviewHandle, Props>((props, ref) => {
    const video = useRef<HTMLVideoElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const current = useRef(props);
    current.current = props;
    const phrases = useRef(outputPhrases(props.project.words, props.map, props.project.captions.preset, props.project.captions));
    const needsPaint = useRef(true);
    const lastReport = useRef(0);
    const lastPaint = useRef(0);
    const errorReported = useRef(false);
    const points = useRef(new Map<number, { x: number; y: number }>());
    const drag = useRef<{ x: number; y: number; captionY: number; zoom: number; distance: number; framing: FramingConfig } | null>(null);

    const paint = useCallback(() => {
        const element = video.current;
        const target = canvas.current;
        if (!element || !target || element.readyState < 2 || !element.videoWidth) return;
        const context = target.getContext('2d', { alpha: false });
        if (!context) return;
        const frame = current.current;
        renderFrame(context, element, element.videoWidth, element.videoHeight, target.width, target.height, frame.project, frame.map, phrases.current, element.currentTime, frame.raw);
        needsPaint.current = false;
    }, []);

    const seekSource = useCallback((time: number) => {
        const element = video.current;
        if (!element) return;
        const frame = current.current;
        element.currentTime = Math.max(0, Math.min(Math.max(0, frame.project.metadata.duration - .001), time));
        needsPaint.current = true;
        paint();
        frame.onTime(element.currentTime, !element.paused, 0);
    }, [paint]);
    const pause = useCallback(() => { video.current?.pause(); }, []);
    const toggle = useCallback(() => {
        const element = video.current;
        if (!element) return;
        if (!element.paused) { pause(); return; }
        const frame = current.current;
        if (element.ended || element.currentTime >= frame.project.metadata.duration - .05 || (!frame.raw && frame.map.nextKeptSourceTime(element.currentTime) === null)) seekSource(frame.raw ? 0 : frame.map.outputTimeToSourceTime(0));
        else if (!frame.raw && !frame.map.isSourceTimeKept(element.currentTime)) seekSource(frame.map.nextKeptSourceTime(element.currentTime) ?? 0);
        void element.play().catch(error => { pause(); studio.fail('Playback needs another tap', error); });
    }, [pause, seekSource]);
    useImperativeHandle(ref, () => ({ toggle, pause, seek: output => seekSource(current.current.map.outputTimeToSourceTime(output)), seekSource }), [toggle, pause, seekSource]);

    useEffect(() => {
        phrases.current = outputPhrases(props.project.words, props.map, props.project.captions.preset, props.project.captions);
        const target = canvas.current;
        if (target) {
            const frame = dimensions(props.project.framing.ratio, props.project.exportConfig.quality, props.project.metadata);
            const scale = Math.min(1, 640 / Math.max(frame.width, frame.height));
            target.width = Math.max(2, Math.round(frame.width * scale));
            target.height = Math.max(2, Math.round(frame.height * scale));
        }
        needsPaint.current = true;
        paint();
    }, [props.project, props.map, props.raw, paint]);

    useEffect(() => {
        const element = video.current;
        if (!element) return;
        let handle = 0;
        let alive = true;
        void prepareFonts().then(() => { if (alive) { needsPaint.current = true; paint(); } }).catch(() => undefined);
        const tick = (now: number) => {
            const frame = current.current;
            if (!element.paused && !element.seeking && !frame.raw) {
                const next = frame.map.nextKeptSourceTime(element.currentTime);
                if (next === null) pause();
                else if (next > element.currentTime + .002) element.currentTime = next;
            }
            if ((needsPaint.current || !element.paused) && now - lastPaint.current >= 1000 / 30 && !document.hidden) { paint(); lastPaint.current = now; }
            if (now - lastReport.current > 80) { frame.onTime(element.currentTime, !element.paused, element.paused ? 0 : studio.audioAt(element.currentTime, frame.raw)); lastReport.current = now; }
            handle = requestAnimationFrame(tick);
        };
        const ready = () => { needsPaint.current = true; paint(); };
        const seeking = () => { needsPaint.current = true; };
        const onPause = () => current.current.onTime(element.currentTime, false, 0);
        const hidden = () => { if (document.hidden) pause(); };
        const onError = () => { if (!errorReported.current) { errorReported.current = true; studio.fail('This video cannot be previewed', 'Your browser could read the file but could not play its video track. Try a standard H.264 MP4 copy.'); } };
        element.addEventListener('loadeddata', ready); element.addEventListener('seeked', ready); element.addEventListener('seeking', seeking); element.addEventListener('pause', onPause); element.addEventListener('error', onError); document.addEventListener('visibilitychange', hidden); handle = requestAnimationFrame(tick);
        return () => { alive = false; cancelAnimationFrame(handle); pause(); element.removeEventListener('loadeddata', ready); element.removeEventListener('seeked', ready); element.removeEventListener('seeking', seeking); element.removeEventListener('pause', onPause); element.removeEventListener('error', onError); document.removeEventListener('visibilitychange', hidden); };
    }, [props.project.id, paint, pause]);

    const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (props.raw || !['frame', 'captions'].includes(props.module)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const entries = [...points.current.values()];
        drag.current = { x: event.clientX, y: event.clientY, captionY: props.project.captions.y, zoom: props.project.framing.zoom, framing: { ...props.project.framing }, distance: entries.length === 2 ? Math.hypot(entries[0].x - entries[1].x, entries[0].y - entries[1].y) : 0 };
        props.onInteract();
    };
    const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!points.current.has(event.pointerId) || !drag.current) return;
        points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const rect = event.currentTarget.getBoundingClientRect();
        const start = drag.current;
        const entries = [...points.current.values()];
        if (props.module === 'captions') { props.onCaptionChange({ y: Math.max(.12, Math.min(.86, start.captionY + (event.clientY - start.y) / Math.max(1, rect.height))) }); return; }
        if (entries.length === 2 && start.distance) { const distance = Math.hypot(entries[0].x - entries[1].x, entries[0].y - entries[1].y); props.onFrameChange({ zoom: Math.max(1, Math.min(2.5, start.zoom * distance / start.distance)) }); }
        else props.onFrameChange({ mode: 'fill', ...dragCrop(props.project.metadata.width, props.project.metadata.height, rect.width, rect.height, start.framing, event.clientX - start.x, event.clientY - start.y) });
    };
    const pointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => { points.current.delete(event.pointerId); if (!points.current.size) drag.current = null; };
    const keyboardAdjust = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (props.raw) return;
        const step = event.shiftKey ? .05 : .02;
        if (props.module === 'captions' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); props.onCaptionChange({ y: Math.max(.12, Math.min(.86, props.project.captions.y + (event.key === 'ArrowUp' ? -step : step))) }); props.onInteract(); return; }
        if (props.module !== 'frame' || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); props.onFrameChange({ mode: 'fill', x: Math.max(0, Math.min(1, props.project.framing.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))), y: Math.max(0, Math.min(1, props.project.framing.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))) }); props.onInteract();
    };
    const aspect = dimensions(props.project.framing.ratio, props.project.exportConfig.quality, props.project.metadata);
    const label = props.raw ? 'Original video preview' : props.module === 'frame' ? 'Edited video preview. Drag to reposition the frame, or use arrow keys.' : props.module === 'captions' ? 'Edited video preview. Drag vertically to move captions, or use arrow keys.' : 'Edited video preview';
    return <motion.div layoutId="project-monitor" className={cn('preview-monitor', props.raw && 'is-raw')} style={{ aspectRatio: `${aspect.width}/${aspect.height}`, width: `min(100%, calc(var(--monitor-height) * ${aspect.width / Math.max(1, aspect.height)}))` }}><video ref={video} className="decode-video" src={props.project.source.url} playsInline preload="auto" aria-hidden="true" tabIndex={-1} /><canvas ref={canvas} role="img" tabIndex={props.raw ? -1 : 0} aria-label={label} aria-keyshortcuts={props.raw ? undefined : 'ArrowUp ArrowDown ArrowLeft ArrowRight'} onKeyDown={keyboardAdjust} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} style={{ touchAction: ['frame', 'captions'].includes(props.module) ? 'none' : 'auto' }} />{!props.raw && props.guides && <div className="safe-guides" style={{ top: `${props.project.captions.safe.top * 100}%`, bottom: `${props.project.captions.safe.bottom * 100}%`, left: `${props.project.captions.safe.left * 100}%`, right: `${props.project.captions.safe.right * 100}%` }}><span>SAFE AREA</span><i /></div>}<div className="monitor-label"><i />{props.raw ? 'ORIGINAL' : 'EDITED'}</div></motion.div>;
});
Preview.displayName = 'Preview';
