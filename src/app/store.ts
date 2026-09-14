import { useSyncExternalStore } from 'react';
import type { AppStage, Project, Tasks, TaskName, TaskState, Capabilities, Module, ExportResult, AudioConfig, WaveformData, Pause, TranscriptWord, AudioStats, FramingConfig, CutConfig, AppearanceLook, SpeechAnalysisStatus, PortraitStatus } from '../types/project';
import { resolvedFraming, acceptsVoiceResult, mergeTask } from './result-guards';
import { Jobs, runWorker } from '../lib/jobs';
import { defaultCaptions } from '../features/captions';
import { projectCuts, pausesFromSpeechSegments } from '../features/silence';
import { runSpeechVAD } from '../features/voice-detection';
import { errorText, isAbort } from '../lib/utils';
import { makeWav } from '../features/audio-enhance/dsp';
export const DEFAULT_SPEECH_TIGHT: CutConfig = { detector: 'speech', minPause: .064, padding: .01 };
export const DEFAULT_SPEECH_JUMP: CutConfig = { detector: 'speech', minPause: .064, padding: 0 };
export const DEFAULT_SPEECH_NATURAL: CutConfig = { detector: 'speech', minPause: .2, padding: .08 };
export const DEFAULT_ENERGY_NATURAL: CutConfig = { detector: 'energy', minPause: .7, padding: .19 };
export function defaultCutConfig(hasAudio: boolean, preset: Project['cutPreset'] = hasAudio ? 'tight' : 'off'): CutConfig {
    if (!hasAudio)
        return { ...DEFAULT_ENERGY_NATURAL };
    return { ...(preset === 'jump' ? DEFAULT_SPEECH_JUMP : DEFAULT_SPEECH_TIGHT) };
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
    error: {
        title: string;
        message: string;
    } | null;
    notice: string | null;
    audioUrl: string | null;
    portraitStatus: PortraitStatus;
};
const taskNames: TaskName[] = ['read', 'audio', 'pauses', 'captions', 'face', 'voice', 'export'];
const emptyTasks = () => Object.fromEntries(taskNames.map(n => [n, { status: 'idle', detail: '' }])) as Tasks;
const initial = (): StudioState => ({ stage: 'home', project: null, tasks: emptyTasks(), capabilities: null, module: 'cut', result: null, error: null, notice: null, audioUrl: null, portraitStatus: { status: 'idle', detail: '' } });
/** A single explicit project store. Media buffers live outside React snapshots and are never persisted. */
export class StudioStore {
    private state = initial();
    private listeners = new Set<() => void>();
    private jobs = new Jobs();
    private revision = 0;
    private pcm: Float32Array | null = null;
    private speech: Float32Array | null = null;
    private enhanced: Float32Array | null = null;
    private enhancedKey = '';
    private voiceTimer: ReturnType<typeof setTimeout> | null = null;
    getSnapshot = () => this.state;
    subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
    private emit(patch: Partial<StudioState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
    task = (name: TaskName, patch: Partial<TaskState>) => this.emit({ tasks: { ...this.state.tasks, [name]: mergeTask(this.state.tasks[name], patch) } });
    patch = (patch: Partial<Project>) => {
        if (this.state.project)
            this.emit({ project: { ...this.state.project, ...patch } });
    };
    /** Shared cut authority for callers that need the current EDL snapshot. */
    cuts = () => this.state.project ? projectCuts(this.state.project) : [];
    setCutPreset = (cutPreset: Project['cutPreset']) => {
        const p = this.state.project;
        if (!p)
            return;
        const current = p.cutConfig ?? defaultCutConfig(p.metadata.hasAudio, p.cutPreset);
        const config: CutConfig = cutPreset === 'off'
            ? { ...current, detector: p.metadata.hasAudio ? current.detector : 'energy' }
            : cutPreset === 'jump'
                ? { ...(p.metadata.hasAudio ? DEFAULT_SPEECH_JUMP : DEFAULT_ENERGY_NATURAL) }
                : cutPreset === 'tight'
                    ? { ...(p.metadata.hasAudio ? DEFAULT_SPEECH_TIGHT : DEFAULT_ENERGY_NATURAL) }
                    : { ...(p.metadata.hasAudio ? DEFAULT_SPEECH_NATURAL : DEFAULT_ENERGY_NATURAL) };
        this.patch({ cutPreset, cutConfig: config });
    };
    module = (module: Module) => this.emit({ module });
    clearError = () => this.emit({ error: null });
    clearNotice = () => this.emit({ notice: null });
    setPortraitStatus = (portraitStatus: PortraitStatus) => this.emit({ portraitStatus });
    fail = (title: string, error: unknown) => this.emit({ error: { title, message: errorText(error) } });
    initialize = async () => {
        try {
            const { getCapabilities } = await import('../features/media/capabilities');
            this.emit({ capabilities: await getCapabilities() });
        }
        catch (error) {
            this.fail('Browser check failed', error);
        }
    };
    private disposeMedia() {
        this.jobs.cancelAll();
        if (this.voiceTimer)
            clearTimeout(this.voiceTimer);
        this.voiceTimer = null;
        const s = this.state;
        for (const url of [s.project?.source.url, s.project?.source.thumbnail, s.result?.url, s.audioUrl])
            if (url)
                URL.revokeObjectURL(url);
        this.pcm = this.speech = this.enhanced = null;
        this.enhancedKey = '';
    }
    reset = () => { this.revision++; this.disposeMedia(); const capabilities = this.state.capabilities; this.emit({ ...initial(), capabilities }); };
    ingest = async (file: File, recordingMeta?: Project['recording']) => {
        const caps = this.state.capabilities;
        if (caps && (!caps.decode || !caps.encode)) {
            this.fail('Open in your browser', caps.reason);
            return;
        }
        this.reset();
        const revision = this.revision, signal = this.jobs.start('project');
        this.emit({ stage: 'ingest' });
        this.task('read', { status: 'running', detail: 'Reading your video' });
        try {
            const { inspectVideo } = await import('../features/media/ingest');
            const { source, metadata } = await inspectVideo(file, caps?.constrained ?? true, signal);
            if (signal.aborted || revision !== this.revision) {
                URL.revokeObjectURL(source.url);
                URL.revokeObjectURL(source.thumbnail);
                return;
            }
            const supportedLooks: AppearanceLook[] = ['natural', 'soft', 'vivid', 'warm', 'mono', 'cool'];
            const look = recordingMeta?.look && supportedLooks.includes(recordingMeta.look as AppearanceLook) ? recordingMeta.look as AppearanceLook : 'natural';
            const intensity = Math.max(0, Math.min(1, recordingMeta?.lookIntensity ?? 0));
            const defaultConfig = defaultCutConfig(metadata.hasAudio, metadata.hasAudio ? 'tight' : 'off');
            const speechStatus: SpeechAnalysisStatus = { status: 'idle', detail: metadata.hasAudio ? 'Speech-aware detection starts after local audio is decoded.' : 'No audio track; speech-aware detection is unavailable.' };
            const project: Project = { id: crypto.randomUUID(), source, metadata, waveform: { peaks: [], rms: [], duration: metadata.duration, windowMs: 20, noiseFloorDb: -90, speechDb: -90 }, pauses: [], overrides: {}, cutPreset: metadata.hasAudio ? 'tight' : 'off', cutConfig: defaultConfig, speechStatus, sensitivity: .5, words: [], captions: { ...defaultCaptions, enabled: false, safe: { ...defaultCaptions.safe } }, audio: { enabled: false, noise: 'off', volume: 1 }, appearance: { look, intensity }, recording: recordingMeta, framing: defaultFraming(), faces: [], exportConfig: { quality: caps?.supported1080 && !caps.constrained ? 1080 : 720, fps: 30 } };
            this.emit({ project, stage: 'analyzing' });
            this.task('read', { status: 'done', detail: 'Video ready', progress: 1 });
            if (metadata.hasAudio) {
                await this.analyzeAudio();
                if (this.speech)
                    await this.analyzeSpeech();
            }
            else {
                for (const name of ['audio', 'pauses', 'captions', 'voice'] as TaskName[])
                    this.task(name, { status: 'cancelled', detail: 'No audio track' });
                this.emit({ notice: 'This video has no audio. Framing and MP4 export are still available.' });
            }
            if (signal.aborted || revision !== this.revision)
                return;
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
        finally {
            this.jobs.finish('project', signal);
        }
    };
    analyzeAudio = async () => {
        const p = this.state.project;
        if (!p)
            return;
        const signal = this.jobs.start('audio'), id = p.id;
        this.jobs.cancel('voice');
        if (this.voiceTimer) clearTimeout(this.voiceTimer);
        this.voiceTimer = null;
        this.enhanced = null;
        this.enhancedKey = '';
        if (this.state.audioUrl) URL.revokeObjectURL(this.state.audioUrl);
        this.emit({ audioUrl: null });
        this.task('audio', { status: 'running', detail: 'Building your waveform' });
        this.task('pauses', { status: 'running', detail: 'Waiting for audio' });
        try {
            const result = await runWorker<{
                pcm: Float32Array;
                speech: Float32Array;
                waveform: WaveformData;
                pauses: Pause[];
                sourceStats: AudioStats;
            }>(new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' }), { file: p.source.file, duration: p.metadata.duration }, signal, s => this.task('audio', s));
            if (this.state.project?.id !== id || signal.aborted)
                return;
            this.pcm = result.pcm;
            this.speech = result.speech;
            this.patch({ waveform: result.waveform, pauses: result.pauses, speechPauses: undefined, speechStatus: { status: 'idle', detail: 'Speech-aware detection runs when AutoEdit is selected.' }, sourceAudioStats: result.sourceStats });
            this.task('audio', { status: 'done', detail: 'Waveform ready', progress: 1 });
            this.task('pauses', { status: 'done', detail: `${result.pauses.length} pauses found`, progress: 1 });
        }
        catch (error) {
            if (!signal.aborted) {
                this.task('audio', { status: 'error', detail: errorText(error) });
                this.task('pauses', { status: 'error', detail: 'Audio analysis needs a retry' });
                this.emit({ notice: 'Audio analysis failed. Retry it before exporting this video.' });
            }
        }
        finally {
            this.jobs.finish('audio', signal);
        }
    };
    /** Run the pinned Silero model for the default speech-aware cut pass. */
    analyzeSpeech = async () => {
        const p = this.state.project;
        if (!p || !this.speech || !p.metadata.hasAudio)
            return;
        const signal = this.jobs.start('pauses'), id = p.id;
        this.patch({ speechStatus: { status: 'preparing', detail: 'Loading the local speech detector…' } });
        this.task('pauses', { status: 'running', detail: 'Preparing speech-aware detection', progress: undefined });
        try {
            const speechBase = typeof location === 'undefined' ? '' : new URL(import.meta.env.BASE_URL, location.origin).href;
            const result = await runSpeechVAD(this.speech, p.metadata.duration, speechBase, signal, s => {
                this.task('pauses', s);
                if (s.detail)
                    this.patch({ speechStatus: { status: 'preparing', detail: s.detail, progress: s.progress } });
            });
            if (this.state.project?.id !== id || signal.aborted)
                return;
            const speechPauses = pausesFromSpeechSegments(result.segments, p.metadata.duration);
            this.patch({ speechSegments: result.segments, speechPauses, speechStatus: { status: 'ready', detail: result.segments.length ? `Speech-aware detector found ${result.segments.length} spoken regions.` : 'No speech detected; original kept for review.', progress: 1 } });
            this.task('pauses', { status: 'done', detail: `${speechPauses.length} speech-aware pauses found`, progress: 1 });
        }
        catch (error) {
            if (!signal.aborted && this.state.project?.id === id) {
                this.patch({ speechStatus: { status: 'error', detail: 'Speech-aware detection unavailable; original kept for review.' } });
                this.task('pauses', { status: 'error', detail: 'Speech-aware model unavailable · retry or choose Energy explicitly' });
                this.emit({ notice: `Speech-aware detection was unavailable. The original is kept until you choose Energy detection or retry (${errorText(error)}).` });
            }
        }
        finally {
            this.jobs.finish('pauses', signal);
        }
    };
    setCutConfig = (patch: Partial<CutConfig>) => {
        const p = this.state.project;
        if (!p)
            return;
        const current: CutConfig = { ...defaultCutConfig(p.metadata.hasAudio, p.cutPreset), ...(p.cutConfig ?? {}) };
        const config: CutConfig = {
            detector: patch.detector ?? current.detector,
            minPause: Math.max(.04, Math.min(2, patch.minPause ?? current.minPause)),
            padding: Math.max(0, Math.min(.4, patch.padding ?? current.padding)),
        };
        this.patch({ cutConfig: config });
        if (config.detector === 'speech') {
            const status = p.speechStatus?.status;
            if (status !== 'ready' && status !== 'preparing')
                void this.analyzeSpeech();
        }
        else if (this.state.tasks.pauses.status === 'running') {
            this.jobs.cancel('pauses');
            this.patch({ speechStatus: { status: 'cancelled', detail: 'Speech-aware detection cancelled. Energy detection is active.' } });
            this.task('pauses', { status: 'cancelled', detail: 'Energy detection is active' });
        }
    };
    transcribe = async () => {
        const p = this.state.project;
        if (!p || !this.speech)
            return;
        const signal = this.jobs.start('captions'), id = p.id;
        this.task('captions', { status: 'running', detail: 'Preparing captions', progress: undefined });
        try {
            const audio = this.speech.slice();
            const { words, accelerated } = await runWorker<{
                words: TranscriptWord[];
                accelerated: boolean;
            }>(new Worker(new URL('../workers/transcription.worker.ts', import.meta.url), { type: 'module' }), { audio, base: new URL(import.meta.env.BASE_URL, location.origin).href, gpu: false }, signal, s => this.task('captions', s), [audio.buffer]);
            if (this.state.project?.id !== id || signal.aborted)
                return;
            this.patch({ words });
            this.task('captions', { status: 'done', detail: words.length ? `${words.length} words · ${accelerated ? 'accelerated locally' : 'processed locally'}` : 'No speech detected', progress: 1 });
        }
        catch {
            if (!signal.aborted) {
                this.task('captions', { status: 'error', detail: 'Captions couldn’t be generated. Check your connection for the model download, then retry.' });
            }
        }
        finally {
            this.jobs.finish('captions', signal);
        }
    };
    enhance = async () => {
        const p = this.state.project;
        if (!p || !this.pcm || !p.audio.enabled)
            return;
        const signal = this.jobs.start('voice'), id = p.id, key = p.audio.noise;
        if (this.enhanced && this.enhancedKey === key) {
            this.task('voice', { status: 'done', detail: 'Voice enhanced', progress: 1 });
            this.jobs.finish('voice', signal);
            return;
        }
        this.task('voice', { status: 'running', detail: 'Preparing your voice', progress: undefined });
        try {
            const pcm = this.pcm.slice();
            const result = await runWorker<{
                pcm: Float32Array;
                stats: AudioStats;
            }>(new Worker(new URL('../workers/voice.worker.ts', import.meta.url), { type: 'module' }), { pcm, config: p.audio }, signal, s => this.task('voice', s), [pcm.buffer]);
            if (this.state.project?.id !== id || signal.aborted)
                return;
            if (!acceptsVoiceResult(this.state.project.audio, key)) return;
            this.enhanced = result.pcm;
            this.enhancedKey = key;
            this.patch({ audioStats: result.stats });
            const old = this.state.audioUrl, url = URL.createObjectURL(makeWav(result.pcm));
            this.emit({ audioUrl: url });
            if (old)
                URL.revokeObjectURL(old);
            this.task('voice', { status: 'done', detail: result.stats.denoised ? 'Noise reduced · voice balanced' : 'Voice balanced', progress: 1 });
            if (result.stats.warning)
                this.emit({ notice: result.stats.warning });
        }
        catch {
            if (!signal.aborted) {
                this.task('voice', { status: 'error', detail: 'Voice processing failed. Original audio is still available.' });
                this.patch({ audio: { ...this.state.project!.audio, enabled: false } });
            }
        }
        finally {
            this.jobs.finish('voice', signal);
        }
    };
    setAudio = (patch: Partial<AudioConfig>) => {
        const p = this.state.project;
        if (!p)
            return;
        const audio = { ...p.audio, ...patch };
        this.patch({ audio });
        if (!audio.enabled) {
            if (this.voiceTimer) clearTimeout(this.voiceTimer);
            this.voiceTimer = null;
            this.jobs.cancel('voice');
            this.task('voice', { status: 'cancelled', detail: 'Original voice' });
            return;
        }
        if (patch.noise !== undefined || patch.enabled === true) {
            this.jobs.cancel('voice');
            if (this.enhancedKey !== audio.noise) {
                this.enhanced = null;
                this.enhancedKey = '';
                if (this.state.audioUrl) URL.revokeObjectURL(this.state.audioUrl);
                this.emit({ audioUrl: null });
            }
            if (this.voiceTimer)
                clearTimeout(this.voiceTimer);
            this.task('voice', { status: 'running', detail: 'Preparing your voice', progress: undefined });
            this.voiceTimer = setTimeout(() => { this.voiceTimer = null; void this.enhance(); }, 200);
        }
    };
    setFraming = (patch: Partial<FramingConfig>) => {
        const p = this.state.project;
        if (!p) return;
        // Any explicit adjustment wins over an in-flight automatic decision.
        if (this.state.tasks.face.status === 'running') this.cancelTask('face');
        this.patch({ framing: { ...p.framing, ...patch } });
    };
    frame = async () => {
        const p = this.state.project;
        if (!p)
            return;
        const signal = this.jobs.start('face'), id = p.id;
        this.task('face', { status: 'running', detail: 'Preparing smart framing', progress: undefined });
        try {
            const { trackFaces } = await import('../features/face-track');
            const faces = await trackFaces(p.source.file, p.metadata.duration, signal, s => this.task('face', s));
            if (this.state.project?.id !== id || signal.aborted)
                return;
            this.patch({ faces, framing: resolvedFraming(this.state.project.framing, p.framing, !!faces.length) });
            this.task('face', { status: 'done', detail: 'Subject frame locked', progress: 1 });
        }
        catch (error) {
            if (!signal.aborted && this.state.project?.id === id) {
                this.task('face', { status: 'error', detail: errorText(error) });
                this.patch({ framing: resolvedFraming(this.state.project.framing, p.framing, false) });
            }
        }
        finally {
            this.jobs.finish('face', signal);
        }
    };
    cancelTask = (name: TaskName) => { this.jobs.cancel(name); this.task(name, { status: 'cancelled', detail: 'Cancelled — you can retry' }); };
    review = () => {
        if (this.state.project)
            this.emit({ stage: 'editor' });
    };
    cancel = () => {
        this.jobs.cancelAll();
        if (this.voiceTimer)
            clearTimeout(this.voiceTimer);
        this.voiceTimer = null;
        for (const name of taskNames)
            if (this.state.tasks[name].status === 'running')
                this.task(name, { status: 'cancelled', detail: 'Cancelled — your edits are safe' });
        this.emit({ stage: this.state.project ? 'editor' : 'home' });
    };
    autoEdit = () => {
        const p = this.state.project;
        if (!p)
            return;
        const speechReady = p.speechStatus?.status === 'ready';
        const hasAudio = p.metadata.hasAudio;
        this.patch({
            cutPreset: hasAudio ? 'tight' : 'off',
            cutConfig: defaultCutConfig(hasAudio, hasAudio ? 'tight' : 'off'),
            speechPauses: speechReady ? p.speechPauses : undefined,
            speechSegments: speechReady ? p.speechSegments : undefined,
            speechStatus: hasAudio
                ? speechReady ? p.speechStatus : p.speechStatus?.status === 'error' ? p.speechStatus : { status: 'idle', detail: 'Speech-aware detection is ready to retry before cutting.' }
                : undefined,
            sensitivity: .5,
            overrides: {},
            captions: { ...defaultCaptions, enabled: false, safe: { ...defaultCaptions.safe } },
            audio: { enabled: false, noise: 'off', volume: 1 },
            framing: defaultFraming(),
        });
        if (hasAudio && this.speech && !speechReady && p.speechStatus?.status !== 'error')
            void this.analyzeSpeech();
        this.emit({ notice: 'AutoEdit defaults applied: speech-aware tight cuts, original voice, original framing. Your transcript corrections are preserved but captions stay off until enabled.' });
    };
    export = async () => {
        const p = this.state.project;
        if (!p)
            return;
        if (p.metadata.hasAudio && !this.pcm) {
            this.fail('Your audio isn’t ready', 'Retry audio analysis in the Audio module before exporting.');
            return;
        }
        if (p.audio.enabled && (this.state.tasks.voice.status === 'running' || this.enhancedKey !== p.audio.noise || !this.enhanced)) {
            this.fail('Your voice is still processing', 'Wait for Voice Enhance to finish, or turn it off to use the original audio.');
            return;
        }
        if (this.state.tasks.captions.status === 'running') {
            this.fail('Captions are still processing', 'Finish or cancel caption generation before exporting.');
            return;
        }
        if (this.state.tasks.face.status === 'running' || this.state.tasks.audio.status === 'running') {
            this.fail('Your edit is still being prepared', 'Finish or cancel the active analysis before exporting.');
            return;
        }
        // Stop the ingest orchestrator from starting another model after this snapshot is taken.
        this.jobs.cancel('project');
        const signal = this.jobs.start('export');
        this.emit({ stage: 'exporting', error: null });
        this.task('export', { status: 'running', detail: 'Preparing your MP4', progress: undefined });
        try {
            const { exportVideo } = await import('../features/exporter');
            const result = await exportVideo(p, p.audio.enabled ? this.enhanced : this.pcm, this.state.capabilities?.constrained ?? true, signal, s => this.task('export', s));
            if (signal.aborted) {
                URL.revokeObjectURL(result.url);
                return;
            }
            if (this.state.result)
                URL.revokeObjectURL(this.state.result.url);
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
        finally {
            this.jobs.finish('export', signal);
        }
    };
    editAgain = () => this.emit({ stage: 'editor' });
    audioAt = (sourceTime: number, raw = false): number => {
        const data = !raw && this.state.project?.audio.enabled ? this.enhanced : this.pcm;
        if (!data)
            return 0;
        const at = Math.floor(sourceTime * 48000);
        let sum = 0, count = 0;
        for (let i = at; i < Math.min(data.length, at + 1024); i++) {
            sum += data[i] * data[i];
            count++;
        }
        return Math.sqrt(sum / Math.max(1, count)) * (this.state.project?.audio.volume ?? 1);
    };
    clearModels = async () => {
        this.cancelTask('captions');
        try {
            const { clearModelCache } = await import('../features/sharing');
            await clearModelCache();
            this.emit({ notice: 'Downloaded speech models cleared. Your current edits are unchanged.' });
        }
        catch (error) {
            this.fail('Cache couldn’t be cleared', error);
        }
    };
}
export const studio = new StudioStore();
export const useStudio = () => useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
