import { useSyncExternalStore } from 'react';
import type { AppStage, Project, Tasks, TaskName, TaskState, Capabilities, Module, ExportResult, AudioConfig, WaveformData, FramingConfig, CutConfig, AppearanceLook } from '../types/project';
import { mergeTask } from './result-guards';
import { Jobs, runWorker } from '../lib/jobs';
import { defaultCaptions } from '../features/captions';
import { projectCuts, defaultCutHandles, normalizeCutDetector, resolveCutHandles } from '../features/silence';
import { errorText, isAbort } from '../lib/utils';

export const DEFAULT_AUDIO_TIGHT: CutConfig = { detector: 'audio', minPause: .22, ...defaultCutHandles('tight') };
export const DEFAULT_AUDIO_JUMP: CutConfig = { detector: 'audio', minPause: .1, ...defaultCutHandles('jump') };
export const DEFAULT_AUDIO_NATURAL: CutConfig = { detector: 'audio', minPause: .5, ...defaultCutHandles('natural') };
/** Kept as an export alias for integrations that used the first editor pass. */
export const DEFAULT_SPEECH_TIGHT = DEFAULT_AUDIO_TIGHT;
export const DEFAULT_SPEECH_JUMP = DEFAULT_AUDIO_JUMP;
export const DEFAULT_SPEECH_NATURAL = DEFAULT_AUDIO_NATURAL;
export const DEFAULT_ENERGY_NATURAL: CutConfig = { detector: 'energy', minPause: .5, ...defaultCutHandles('natural') };

export function defaultCutConfig(hasAudio: boolean, preset: Project['cutPreset'] = hasAudio ? 'tight' : 'off'): CutConfig {
    if (!hasAudio)
        return { detector: 'energy', minPause: .5, ...defaultCutHandles('off') };
    return preset === 'jump' ? { ...DEFAULT_AUDIO_JUMP } : preset === 'natural' ? { ...DEFAULT_AUDIO_NATURAL } : { ...DEFAULT_AUDIO_TIGHT };
}

export function defaultFraming(): FramingConfig {
    return { ratio: 'original', mode: 'fit', x: .5, y: .5, zoom: 1, punch: false };
}

export type StudioState = {
    stage: AppStage;
    project: Project | null;
    tasks: Tasks;
    capabilities: Capabilities | null;
    module: Module;
    result: ExportResult | null;
    error: { title: string; message: string } | null;
    notice: string | null;
};

const taskNames: TaskName[] = ['read', 'audio', 'pauses', 'captions', 'export'];
const emptyTasks = () => Object.fromEntries(taskNames.map(name => [name, { status: 'idle', detail: '' }])) as Tasks;
const initial = (): StudioState => ({ stage: 'home', project: null, tasks: emptyTasks(), capabilities: null, module: 'cut', result: null, error: null, notice: null });

/**
 * A single explicit project store. Media buffers live outside React snapshots
 * and are never persisted. Ingest performs metadata plus deterministic PCM
 * activity analysis, then hands the project to the editor.
 */
export class StudioStore {
    private state = initial();
    private listeners = new Set<() => void>();
    private jobs = new Jobs();
    private revision = 0;
    private pcm: Float32Array | null = null;

    getSnapshot = () => this.state;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    private emit(patch: Partial<StudioState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
    task = (name: TaskName, patch: Partial<TaskState>) => this.emit({ tasks: { ...this.state.tasks, [name]: mergeTask(this.state.tasks[name], patch) } });
    patch = (patch: Partial<Project>) => { if (this.state.project) this.emit({ project: { ...this.state.project, ...patch } }); };
    cuts = () => this.state.project ? projectCuts(this.state.project) : [];

    setCutPreset = (cutPreset: Project['cutPreset']) => {
        const project = this.state.project;
        if (!project) return;
        const config = project.metadata.hasAudio ? defaultCutConfig(true, cutPreset) : defaultCutConfig(false, cutPreset);
        this.patch({ cutPreset, cutConfig: config });
    };

    module = (module: Module) => this.emit({ module });
    clearError = () => this.emit({ error: null });
    clearNotice = () => this.emit({ notice: null });
    fail = (title: string, error: unknown) => this.emit({ error: { title, message: errorText(error) } });

    initialize = async () => {
        try {
            const { getCapabilities } = await import('../features/media/capabilities');
            this.emit({ capabilities: await getCapabilities() });
        }
        catch (error) { this.fail('Browser check failed', error); }
    };

    private disposeMedia() {
        this.jobs.cancelAll();
        const state = this.state;
        for (const url of [state.project?.source.url, state.project?.source.thumbnail, state.result?.url])
            if (url) URL.revokeObjectURL(url);
        this.pcm = null;
    }

    reset = () => { this.revision++; this.disposeMedia(); const capabilities = this.state.capabilities; this.emit({ ...initial(), capabilities }); };

    ingest = async (file: File, recordingMeta?: Project['recording']) => {
        const capabilities = this.state.capabilities;
        if (capabilities && (!capabilities.decode || !capabilities.encode)) {
            this.fail('Open in your browser', capabilities.reason);
            return;
        }
        this.reset();
        const revision = this.revision;
        const signal = this.jobs.start('project');
        this.emit({ stage: 'ingest' });
        this.task('read', { status: 'running', detail: 'Reading your video' });
        try {
            const { inspectVideo } = await import('../features/media/ingest');
            const { source, metadata } = await inspectVideo(file, capabilities?.constrained ?? true, signal);
            if (signal.aborted || revision !== this.revision) {
                URL.revokeObjectURL(source.url);
                if (source.thumbnail) URL.revokeObjectURL(source.thumbnail);
                return;
            }
            const supportedLooks: AppearanceLook[] = ['natural', 'soft', 'vivid', 'warm', 'mono', 'cool'];
            const look = recordingMeta?.look && supportedLooks.includes(recordingMeta.look as AppearanceLook) ? recordingMeta.look as AppearanceLook : 'natural';
            const intensity = Math.max(0, Math.min(1, recordingMeta?.lookIntensity ?? 0));
            const project: Project = {
                id: crypto.randomUUID(), source, metadata,
                waveform: { peaks: [], rms: [], duration: metadata.duration, windowMs: 20, noiseFloorDb: -90, activityDb: -90 },
                pauses: [], overrides: {}, cutPreset: metadata.hasAudio ? 'tight' : 'off',
                cutConfig: defaultCutConfig(metadata.hasAudio, metadata.hasAudio ? 'tight' : 'off'),
                cutAdjustments: {}, sensitivity: .5, words: [],
                captions: { ...defaultCaptions, enabled: false, safe: { ...defaultCaptions.safe } },
                // Original audio is always the initial source. The exporter
                // reads the decoded PCM directly.
                audio: { enabled: false, noise: 'off', volume: 1 },
                appearance: { look, intensity }, recording: recordingMeta,
                framing: defaultFraming(), faces: [],
                exportConfig: { quality: capabilities?.supported1080 && !capabilities.constrained ? 1080 : 720, fps: 30 }
            };
            this.emit({ project, stage: 'analyzing' });
            this.task('read', { status: 'done', detail: 'Video ready', progress: 1 });
            if (metadata.hasAudio) {
                await this.analyzeAudio();
            }
            else {
                this.task('audio', { status: 'cancelled', detail: 'No audio track' });
                this.task('pauses', { status: 'cancelled', detail: 'No audio track' });
                this.emit({ notice: 'This video has no audio. Framing and MP4 export are still available.' });
            }
            if (!signal.aborted && revision === this.revision && this.state.stage === 'analyzing')
                this.emit({ stage: 'editor' });
        }
        catch (error) {
            if (!isAbort(error) && !signal.aborted && revision === this.revision) {
                this.task('read', { status: 'error', detail: errorText(error) });
                this.emit({ stage: this.state.project ? 'editor' : 'home' });
                this.fail('This video couldn’t be opened', error);
            }
        }
        finally { this.jobs.finish('project', signal); }
    };

    analyzeAudio = async () => {
        const project = this.state.project;
        if (!project || !project.metadata.hasAudio) return;
        const signal = this.jobs.start('audio');
        const id = project.id;
        this.task('audio', { status: 'running', detail: 'Building the waveform' });
        this.task('pauses', { status: 'running', detail: 'Finding sound gaps' });
        try {
            const result = await runWorker<{
                pcm: Float32Array;
                waveform: WaveformData;
                pauses: Project['pauses'];
                sourceStats?: Project['sourceAudioStats'];
            }>(new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' }), { file: project.source.file, duration: project.metadata.duration }, signal, state => this.task('audio', state));
            if (this.state.project?.id !== id || signal.aborted) return;
            this.pcm = result.pcm;
            this.patch({ waveform: result.waveform, pauses: result.pauses, sourceAudioStats: result.sourceStats });
            this.task('audio', { status: 'done', detail: 'Waveform ready', progress: 1 });
            this.task('pauses', { status: 'done', detail: `${result.pauses.length} sound gaps found`, progress: 1 });
        }
        catch (error) {
            if (!signal.aborted) {
                this.task('audio', { status: 'error', detail: errorText(error) });
                this.task('pauses', { status: 'error', detail: 'Audio analysis needs a retry' });
                this.emit({ notice: 'Audio analysis failed. Retry it before exporting this video.' });
            }
        }
        finally { this.jobs.finish('audio', signal); }
    };

    setCutConfig = (patch: Partial<CutConfig>) => {
        const project = this.state.project;
        if (!project) return;
        const current = project.cutConfig ?? defaultCutConfig(project.metadata.hasAudio, project.cutPreset);
        const handles = resolveCutHandles(current, project.cutPreset);
        const config: CutConfig = {
            detector: normalizeCutDetector(patch.detector ?? current.detector),
            minPause: Math.max(.04, Math.min(2, patch.minPause ?? current.minPause)),
            afterSpeechPadding: Math.max(0, Math.min(.6, patch.afterSpeechPadding ?? (patch.padding ?? handles.afterSpeechPadding))),
            beforeSpeechPadding: Math.max(0, Math.min(.6, patch.beforeSpeechPadding ?? (patch.padding ?? handles.beforeSpeechPadding)))
        };
        this.patch({ cutConfig: config });
    };

    setCutAdjustments = (id: string, adjustment: Partial<{ startDelta: number; endDelta: number }>) => {
        const project = this.state.project;
        if (!project) return;
        const previous = project.cutAdjustments?.[id] ?? { startDelta: 0, endDelta: 0 };
        const pause = project.pauses.find(candidate => candidate.id === id);
        if (!pause) return;
        const handles = resolveCutHandles(project.cutConfig, project.cutPreset);
        const sourceStart = Math.max(0, pause.start);
        const sourceEnd = Math.min(project.metadata.duration, pause.end);
        const baseStart = sourceStart <= 1e-9 ? Math.max(sourceStart + handles.afterSpeechPadding, Math.min(sourceEnd, .15)) : sourceStart + handles.afterSpeechPadding;
        const baseEnd = sourceEnd - handles.beforeSpeechPadding;
        let start = Math.max(sourceStart, Math.min(sourceEnd, baseStart + (adjustment.startDelta ?? previous.startDelta)));
        let end = Math.max(sourceStart, Math.min(sourceEnd, baseEnd + (adjustment.endDelta ?? previous.endDelta)));
        if (end < start) {
            if (adjustment.startDelta !== undefined && adjustment.endDelta === undefined) end = start;
            else if (adjustment.endDelta !== undefined && adjustment.startDelta === undefined) start = end;
            else start = end = (start + end) / 2;
        }
        const next = { startDelta: start - baseStart, endDelta: end - baseEnd };
        this.patch({ cutAdjustments: { ...(project.cutAdjustments ?? {}), [id]: next } });
    };

    resetCuts = () => {
        const project = this.state.project;
        if (!project) return;
        this.patch({ overrides: {}, cutAdjustments: {}, sensitivity: .5, cutConfig: defaultCutConfig(project.metadata.hasAudio, project.cutPreset) });
    };

    /** Captions are manual-only. This helper lets a caller supply timed words. */
    setManualWords = (words: Project['words']) => this.patch({ words: words.filter(word => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start) });

    /** Kept for callers that adjust source volume; source audio remains unchanged. */
    setAudio = (patch: Partial<AudioConfig>) => {
        const project = this.state.project;
        if (!project) return;
        this.patch({ audio: { ...project.audio, ...patch, enabled: false, noise: 'off' } });
    };

    setFraming = (patch: Partial<FramingConfig>) => {
        const project = this.state.project;
        if (!project) return;
        const safe = patch.mode === 'auto' ? { ...patch, mode: 'fill' as const } : patch;
        this.patch({ framing: { ...project.framing, ...safe } });
    };

    cancelTask = (name: TaskName) => { this.jobs.cancel(name); this.task(name, { status: 'cancelled', detail: 'Cancelled — you can retry' }); };
    review = () => { if (this.state.project) this.emit({ stage: 'editor' }); };
    cancel = () => {
        this.jobs.cancelAll();
        for (const name of taskNames)
            if (this.state.tasks[name].status === 'running') this.task(name, { status: 'cancelled', detail: 'Cancelled — your edits are safe' });
        this.emit({ stage: this.state.project ? 'editor' : 'home' });
    };

    autoEdit = () => {
        const project = this.state.project;
        if (!project) return;
        const hasAudio = project.metadata.hasAudio;
        this.patch({
            cutPreset: hasAudio ? 'tight' : 'off', cutConfig: defaultCutConfig(hasAudio, hasAudio ? 'tight' : 'off'),
            sensitivity: .5, overrides: {}, cutAdjustments: {}, captions: { ...defaultCaptions, enabled: false, safe: { ...defaultCaptions.safe } },
            audio: { enabled: false, noise: 'off', volume: 1 }, framing: defaultFraming()
        });
        this.emit({ notice: 'AutoCut defaults applied: sound-aware Tight cuts, original audio, and original framing. Captions remain off until you add timed text.' });
    };

    export = async () => {
        const project = this.state.project;
        if (!project) return;
        if (project.metadata.hasAudio && !this.pcm) {
            this.fail('Your audio isn’t ready', 'Retry audio analysis in the Audio module before exporting.');
            return;
        }
        if (this.state.tasks.audio.status === 'running') {
            this.fail('Your edit is still being prepared', 'Finish or cancel audio analysis before exporting.');
            return;
        }
        this.jobs.cancel('project');
        const signal = this.jobs.start('export');
        this.emit({ stage: 'exporting', error: null });
        this.task('export', { status: 'running', detail: 'Preparing your MP4', progress: undefined });
        try {
            const { exportVideo } = await import('../features/exporter');
            const result = await exportVideo(project, this.pcm, this.state.capabilities?.constrained ?? true, signal, state => this.task('export', state));
            if (signal.aborted) { URL.revokeObjectURL(result.url); return; }
            if (this.state.result) URL.revokeObjectURL(this.state.result.url);
            this.emit({ result, stage: 'complete' });
            this.task('export', { status: 'done', detail: 'Ready to post', progress: 1 });
        }
        catch (error) {
            if (!signal.aborted) {
                this.emit({ stage: 'editor' });
                this.task('export', { status: 'error', detail: errorText(error) });
                this.fail('Export didn’t finish', error);
            }
        }
        finally { this.jobs.finish('export', signal); }
    };

    editAgain = () => this.emit({ stage: 'editor' });
    audioAt = (sourceTime: number, _raw = false): number => {
        if (!this.pcm) return 0;
        const at = Math.floor(Math.max(0, sourceTime) * 48000);
        let sum = 0;
        let count = 0;
        for (let i = at; i < Math.min(this.pcm.length, at + 1024); i++) { sum += this.pcm[i] * this.pcm[i]; count++; }
        return Math.sqrt(sum / Math.max(1, count)) * (this.state.project?.audio.volume ?? 1);
    };
}

export const studio = new StudioStore();
export const useStudio = () => useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
