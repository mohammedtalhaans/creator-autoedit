import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import type { Project, Module, FramingConfig, CaptionConfig } from '../../types/project';
import { EditMap } from '../../features/edit-map';
import { outputPhrases } from '../../features/captions';
import { dimensions, dragCrop, faceAt } from '../../features/framing';
import { renderFrame, prepareFonts } from '../../features/renderer';
import { createPortraitProcessor, type PortraitProcessor } from '../../features/portrait-effects';
import { studio } from '../../app/store';
import { cn } from '../../lib/utils';
export type PreviewHandle = {
    toggle: () => void;
    pause: () => void;
    seek: (outputTime: number) => void;
    seekSource: (sourceTime: number) => void;
};
type Props = {
    project: Project;
    map: EditMap;
    audioUrl: string | null;
    raw: boolean;
    voiceRaw: boolean;
    module: Module;
    guides: boolean;
    onTime: (time: number, playing: boolean, level: number) => void;
    onFrameChange: (f: Partial<FramingConfig>) => void;
    onCaptionChange: (c: Partial<CaptionConfig>) => void;
    onInteract: () => void;
};
export const Preview = forwardRef<PreviewHandle, Props>((props, ref) => {
    const video = useRef<HTMLVideoElement>(null), audio = useRef<HTMLAudioElement>(null), canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null);
    const current = useRef(props);
    current.current = props;
    const phrases = useRef(outputPhrases(props.project.words, props.map, props.project.captions.preset, props.project.captions));
    const needsPaint = useRef(true), lastReport = useRef(0), lastPaint = useRef(0), errorReported = useRef(false), previousEnhanced = useRef(false);
    const portrait = useRef<PortraitProcessor | null>(null), portraitBitmap = useRef<ImageBitmap | null>(null), portraitInFlight = useRef<Promise<unknown> | null>(null), portraitLastRequest = useRef(0), portraitKey = useRef(''), portraitRequestToken = useRef(0), portraitErrorReported = useRef(false), portraitStatus = useRef<'idle' | 'preparing' | 'ready' | 'error'>('idle');
    const setPortraitStatus = (status: 'idle' | 'preparing' | 'ready' | 'error', detail: string) => {
        if (portraitStatus.current === status)
            return;
        portraitStatus.current = status;
        studio.setPortraitStatus({ status, detail });
    };
    const points = useRef(new Map<number, {
        x: number;
        y: number;
    }>());
    const drag = useRef<{
        x: number;
        y: number;
        fx: number;
        fy: number;
        captionY: number;
        zoom: number;
        distance: number;
        framing: FramingConfig;
    } | null>(null);
    const enhanced = () => { const p = current.current; return !p.raw && !p.voiceRaw && p.project.audio.enabled && !!p.audioUrl && !!audio.current && audio.current.readyState >= 1 && !audio.current.error; };
    const paint = useCallback(() => {
        const v = video.current, c = canvas.current;
        if (!v || !c || v.readyState < 2 || !v.videoWidth)
            return;
        const p = current.current;
        const ctx = c.getContext('2d', { alpha: false });
        if (!ctx)
            return;
        const effects = p.project.recording?.portraitEffects, hasEffects = !!effects && (effects.backgroundBlur > 0 || effects.skinSmoothing > 0);
        const key = hasEffects ? `${effects!.backgroundBlur}:${effects!.skinSmoothing}` : '';
        if (p.raw || !hasEffects) {
            setPortraitStatus('idle', '');
            if (!hasEffects && portraitBitmap.current) { portraitBitmap.current.close(); portraitBitmap.current = null; portrait?.current?.dispose(); portrait.current = null; portraitKey.current = ''; }
            renderFrame(ctx, v, v.videoWidth, v.videoHeight, c.width, c.height, p.project, p.map, phrases.current, v.currentTime, p.raw);
        }
        else {
            if (portraitKey.current !== key) {
                portraitKey.current = key;
                portraitBitmap.current?.close();
                portraitBitmap.current = null;
                portrait?.current?.dispose();
                portrait.current = createPortraitProcessor();
                portraitInFlight.current = null;
                portraitRequestToken.current++;
                portraitLastRequest.current = 0;
                portraitErrorReported.current = false;
                setPortraitStatus('preparing', 'Preparing local portrait mask…');
            }
            const now = performance.now();
            if (!portraitInFlight.current && now - portraitLastRequest.current >= 120) {
                portraitLastRequest.current = now;
                const processor = portrait.current ?? (portrait.current = createPortraitProcessor());
                const request = processor.process(v, v.videoWidth, v.videoHeight, effects!, v.currentTime * 1000);
                const token = ++portraitRequestToken.current;
                portraitInFlight.current = request.then(bitmap => {
                    const currentEffects = current.current.project.recording?.portraitEffects;
                    const currentKey = currentEffects ? `${currentEffects.backgroundBlur}:${currentEffects.skinSmoothing}` : '';
                    if (token === portraitRequestToken.current && currentKey === key && !current.current.raw) {
                        portraitBitmap.current?.close();
                        portraitBitmap.current = bitmap;
                        needsPaint.current = true;
                        setPortraitStatus('ready', 'Portrait mask ready · edited pixels only');
                    }
                    else bitmap.close();
                }).catch(error => {
                    if (!portraitErrorReported.current && !(error instanceof DOMException && error.name === 'AbortError')) {
                        portraitErrorReported.current = true;
                        setPortraitStatus('error', error instanceof Error ? error.message : String(error));
                        studio.fail('Portrait effects unavailable', error);
                    }
                }).finally(() => { if (token === portraitRequestToken.current) portraitInFlight.current = null; });
            }
            const bitmap = portraitBitmap.current;
            renderFrame(ctx, bitmap ?? v, bitmap?.width ?? v.videoWidth, bitmap?.height ?? v.videoHeight, c.width, c.height, p.project, p.map, phrases.current, v.currentTime, p.raw);
        }
        needsPaint.current = false;
    }, []);
    const syncAudio = useCallback((force = false) => {
        const v = video.current, a = audio.current;
        if (!v || !a)
            return;
        const useEnhanced = enhanced();
        v.muted = useEnhanced;
        v.volume = current.current.project.audio.volume;
        a.volume = current.current.project.audio.volume;
        if (!useEnhanced) {
            a.pause();
            previousEnhanced.current = false;
            return;
        }
        if (a.readyState < 1)
            return;
        const difference = v.currentTime - a.currentTime;
        if (force || Math.abs(difference) > .065 || !previousEnhanced.current) {
            a.currentTime = Math.min(Math.max(0, v.currentTime), a.duration || Infinity);
            a.playbackRate = 1;
        }
        else
            a.playbackRate = 1 + Math.max(-.008, Math.min(.008, difference * .12));
        if (!v.paused && !v.seeking && a.paused)
            void a.play().catch(() => { v.pause(); studio.fail('Tap play to continue', 'Your browser paused audio playback. Tap play to restart both tracks together.'); });
        if (v.paused || v.seeking)
            a.pause();
        previousEnhanced.current = true;
    }, []);
    const seekSource = useCallback((time: number) => {
        const v = video.current;
        if (!v)
            return;
        const p = current.current;
        v.currentTime = Math.max(0, Math.min(p.project.metadata.duration - .001, time));
        needsPaint.current = true;
        syncAudio(true);
        p.onTime(v.currentTime, !v.paused, 0);
    }, [syncAudio]);
    const pause = useCallback(() => { video.current?.pause(); audio.current?.pause(); }, []);
    const toggle = useCallback(() => {
        const v = video.current, a = audio.current;
        if (!v)
            return;
        if (!v.paused) {
            pause();
            return;
        }
        const p = current.current;
        if (v.ended || v.currentTime >= p.project.metadata.duration - .05 || (!p.raw && p.map.nextKeptSourceTime(v.currentTime) === null))
            seekSource(p.raw ? 0 : p.map.outputTimeToSourceTime(0));
        else if (!p.raw && !p.map.isSourceTimeKept(v.currentTime))
            seekSource(p.map.nextKeptSourceTime(v.currentTime) ?? 0);
        syncAudio(true);
        // Both play requests originate in the same user gesture (important on mobile Safari).
        const promises = [v.play()];
        if (enhanced() && a && a.readyState >= 1)
            promises.push(a.play());
        void Promise.all(promises).catch(error => { pause(); studio.fail('Playback needs another tap', error); });
    }, [pause, seekSource, syncAudio]);
    useImperativeHandle(ref, () => ({ toggle, pause, seek: t => seekSource(current.current.map.outputTimeToSourceTime(t)), seekSource }), [toggle, pause, seekSource]);
    useEffect(() => {
        phrases.current = outputPhrases(props.project.words, props.map, props.project.captions.preset, props.project.captions);
        const c = canvas.current;
        if (c) {
            const d = dimensions(props.project.framing.ratio, 720, props.project.metadata);
            const scale = Math.min(1, 640 / Math.max(d.width, d.height));
            c.width = Math.round(d.width * scale);
            c.height = Math.round(d.height * scale);
        }
        needsPaint.current = true;
        syncAudio(true);
        paint();
    }, [props.project, props.map, props.raw, props.voiceRaw, props.audioUrl, syncAudio, paint]);
    useEffect(() => {
        const v = video.current, a = audio.current;
        if (!v || !a)
            return;
        let handle = 0, alive = true;
        void prepareFonts().then(() => {
            if (alive) {
                needsPaint.current = true;
                paint();
            }
        }).catch(() => undefined);
        const tick = (now: number) => {
            const p = current.current;
            if (!v.paused && !v.seeking && !p.raw) {
                const next = p.map.nextKeptSourceTime(v.currentTime);
                if (next === null)
                    pause();
                else if (next > v.currentTime + .002) {
                    v.currentTime = next;
                    syncAudio(true);
                }
            }
            if ((needsPaint.current || !v.paused) && now - lastPaint.current >= 1000 / 30 && !document.hidden) {
                paint();
                lastPaint.current = now;
            }
            if (now - lastReport.current > 80) {
                syncAudio();
                p.onTime(v.currentTime, !v.paused, v.paused ? 0 : studio.audioAt(v.currentTime, p.raw || p.voiceRaw));
                lastReport.current = now;
            }
            handle = requestAnimationFrame(tick);
        };
        const ready = () => { needsPaint.current = true; paint(); syncAudio(true); };
        const seeking = () => { a.pause(); needsPaint.current = true; };
        const onPause = () => { a.pause(); current.current.onTime(v.currentTime, false, 0); };
        const hidden = () => {
            if (document.hidden)
                pause();
        };
        const onAudioError = () => {
            a.pause();
            v.muted = false;
            previousEnhanced.current = false;
            studio.setAudio({ enabled: false });
            studio.fail('Enhanced audio could not be previewed', 'The original voice is playing instead. You can retry Voice Enhance in the Audio module.');
        };
        const onError = () => {
            if (!errorReported.current) {
                errorReported.current = true;
                studio.fail('This video cannot be previewed', 'Your browser could read the file but could not play its video track. Try a standard H.264 MP4 copy.');
            }
        };
        v.addEventListener('loadeddata', ready);
        v.addEventListener('seeked', ready);
        v.addEventListener('seeking', seeking);
        v.addEventListener('pause', onPause);
        v.addEventListener('error', onError);
        a.addEventListener('loadedmetadata', ready);
        a.addEventListener('error', onAudioError);
        document.addEventListener('visibilitychange', hidden);
        handle = requestAnimationFrame(tick);
        return () => { alive = false; cancelAnimationFrame(handle); pause(); portraitBitmap.current?.close(); portraitBitmap.current = null; portrait.current?.dispose(); portrait.current = null; v.removeEventListener('loadeddata', ready); v.removeEventListener('seeked', ready); v.removeEventListener('seeking', seeking); v.removeEventListener('pause', onPause); v.removeEventListener('error', onError); a.removeEventListener('loadedmetadata', ready); a.removeEventListener('error', onAudioError); document.removeEventListener('visibilitychange', hidden); };
    }, [props.project.id, paint, pause, syncAudio]);
    const pointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (props.raw || !['frame', 'captions'].includes(props.module))
            return;
        e.currentTarget.setPointerCapture(e.pointerId);
        points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const entries = [...points.current.values()];
        drag.current = { x: e.clientX, y: e.clientY, fx: props.project.framing.x, fy: props.project.framing.y, captionY: props.project.captions.y, framing: { ...props.project.framing }, zoom: props.project.framing.zoom, distance: entries.length === 2 ? Math.hypot(entries[0].x - entries[1].x, entries[0].y - entries[1].y) : 0 };
        props.onInteract();
    };
    const pointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!points.current.has(e.pointerId) || !drag.current)
            return;
        points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = e.currentTarget.getBoundingClientRect(), d = drag.current, entries = [...points.current.values()];
        if (props.module === 'captions') {
            props.onCaptionChange({ y: Math.max(.12, Math.min(.86, d.captionY + (e.clientY - d.y) / r.height)) });
            return;
        }
        if (entries.length === 2 && d.distance) {
            const distance = Math.hypot(entries[0].x - entries[1].x, entries[0].y - entries[1].y);
            props.onFrameChange({ zoom: Math.max(1, Math.min(2.5, d.zoom * distance / d.distance)) });
        }
        else
            props.onFrameChange({ mode: 'fill', ...dragCrop(props.project.metadata.width, props.project.metadata.height, r.width, r.height, d.framing, e.clientX - d.x, e.clientY - d.y, faceAt(props.project.faces, video.current?.currentTime ?? 0)) });
    };
    const pointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        points.current.delete(e.pointerId);
        if (!points.current.size) drag.current = null;
        else {
            const remaining = [...points.current.values()][0], p = current.current.project;
            drag.current = { x: remaining.x, y: remaining.y, fx: p.framing.x, fy: p.framing.y,
                framing: { ...p.framing }, captionY: p.captions.y, zoom: p.framing.zoom, distance: 0 };
        }
    };
    const keyboardAdjust = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (props.raw)
            return;
        const step = e.shiftKey ? .05 : .02;
        if (props.module === 'captions' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            e.stopPropagation();
            props.onCaptionChange({ y: Math.max(.12, Math.min(.86, props.project.captions.y + (e.key === 'ArrowUp' ? -step : step))) });
            props.onInteract();
            return;
        }
        if (props.module !== 'frame' || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
            return;
        e.preventDefault();
        e.stopPropagation();
        props.onFrameChange({ mode: 'fill', x: Math.max(0, Math.min(1, props.project.framing.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0))), y: Math.max(0, Math.min(1, props.project.framing.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0))) });
        props.onInteract();
    };
    const aspect = dimensions(props.project.framing.ratio, 720, props.project.metadata);
    const canvasLabel = props.raw ? 'Original video preview' : props.module === 'frame' ? 'Edited video preview. Drag to reposition the frame, or use arrow keys.' : props.module === 'captions' ? 'Edited video preview. Drag vertically to move captions, or use the up and down arrow keys.' : 'Edited video preview with framing and burned-caption layout';
    return <motion.div layoutId="project-monitor" className={cn('preview-monitor', props.raw && 'is-raw')} ref={container} style={{ aspectRatio: `${aspect.width}/${aspect.height}`, width: `min(100%, calc(var(--monitor-height) * ${aspect.width / aspect.height}))` }}>
  <video ref={video} className="decode-video" src={props.project.source.url} playsInline preload="auto" disablePictureInPicture aria-hidden="true" tabIndex={-1}/><audio ref={audio} src={props.audioUrl ?? undefined} preload="auto" aria-hidden="true"/>
  <canvas ref={canvas} role="img" tabIndex={props.raw ? -1 : 0} aria-label={canvasLabel} aria-keyshortcuts={props.raw ? undefined : 'ArrowUp ArrowDown ArrowLeft ArrowRight'} onKeyDown={keyboardAdjust} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} style={{ touchAction: ['frame', 'captions'].includes(props.module) ? 'none' : 'auto' }}/>
  {!props.raw && props.guides && <div className="safe-guides" style={{ top: `${props.project.captions.safe.top * 100}%`, bottom: `${props.project.captions.safe.bottom * 100}%`, left: `${props.project.captions.safe.left * 100}%`, right: `${props.project.captions.safe.right * 100}%` }}><span>SAFE AREA</span><i /></div>}
  <div className="monitor-label"><i />{props.raw ? 'RAW' : 'EDITED'}</div>
 </motion.div>;
});
Preview.displayName = 'Preview';
