export type AppStage = 'home' | 'ingest' | 'analyzing' | 'editor' | 'exporting' | 'complete';
export type Module = 'cut' | 'captions' | 'frame';
export type CutPreset = 'natural' | 'tight' | 'jump' | 'off';
/** Deterministic local audio activity gate. `energy` is retained for old projects. */
export type CutDetector = 'audio' | 'energy';
export type CutConfig = {
    /** The deterministic detector used to propose pauses. */
    detector: CutDetector;
    /** Minimum source silence that can become a cut, in seconds. */
    minPause: number;
    /** Legacy symmetric edge padding, migrated to the asymmetric handles. */
    padding?: number;
    /** Audio retained after the previous active region, in seconds. */
    afterSpeechPadding?: number;
    /** Audio retained before the next active onset, in seconds. */
    beforeSpeechPadding?: number;
};
export type SpeechAnalysisStatus = {
    status: 'idle' | 'preparing' | 'ready' | 'fallback' | 'error' | 'cancelled';
    detail: string;
    progress?: number;
};
export type PortraitStatus = {
    status: 'idle' | 'preparing' | 'ready' | 'error';
    detail: string;
};
export type TaskName = 'read' | 'audio' | 'pauses' | 'captions' | 'export';
export type TaskState = {
    status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
    detail: string;
    progress?: number;
    loaded?: number;
    total?: number;
};
export type Tasks = Record<TaskName, TaskState>;
export type Metadata = {
    duration: number;
    width: number;
    height: number;
    fps: number;
    size: number;
    videoCodec: string;
    audioCodec: string | null;
    hasAudio: boolean;
    hdr: boolean;
};
export type SourceMedia = {
    file: File;
    url: string;
    thumbnail: string;
    name: string;
};
export type Pause = {
    id: string;
    start: number;
    end: number;
    confidence: number;
};
export type SpeechSegment = {
    start: number;
    end: number;
    confidence?: number;
};
export type CutDecision = {
    id: string;
    start: number;
    end: number;
    enabled: boolean;
};
export type KeepRange = {
    sourceStart: number;
    sourceEnd: number;
};
export type MappedRange = KeepRange & {
    outputStart: number;
    outputEnd: number;
};
export type WaveformData = {
    peaks: number[];
    rms: number[];
    duration: number;
    windowMs: number;
    noiseFloorDb: number;
    /** Upper activity quantile from the deterministic gate. */
    activityDb: number;
    /** Legacy saved field; never interpreted as speech. */
    speechDb?: number;
};
export type TranscriptWord = {
    id: string;
    text: string;
    start: number;
    end: number;
};
export type Phrase = {
    id: string;
    start: number;
    end: number;
    words: TranscriptWord[];
};
export type CaptionPreset = 'clean' | 'punch' | 'editorial' | 'subtitle' | 'creator' | 'bold-outline' | 'karaoke' | 'one-word' | 'minimal' | 'neon';
export type CaptionConfig = {
    enabled: boolean;
    preset: CaptionPreset;
    animation: 'pop' | 'word' | 'smooth';
    font: 'studio' | 'condensed' | 'mono';
    size: number;
    y: number;
    align: 'left' | 'center' | 'right';
    color: string;
    accent: string;
    background: boolean;
    opacity: number;
    shadow: boolean;
    highlight: boolean;
    uppercase: boolean;
    /** Optional short-form layout controls. Older saved projects may omit these. */
    maxWords?: number;
    maxLines?: number;
    outlineWidth?: number;
    outlineColor?: string;
    fontWeight?: number;
    letterSpacing?: number;
    backgroundColor?: string;
    cornerRadius?: number;
    lineGap?: number;
    italic?: boolean;
    safe: {
        top: number;
        bottom: number;
        right: number;
        left: number;
    };
};
export type AudioConfig = {
    enabled: boolean;
    noise: 'off' | 'light' | 'strong';
    volume: number;
};
export type AudioStats = {
    rmsDb: number;
    peakDb: number;
    gainDb: number;
    denoised: boolean;
    warning?: string;
};
export type FacePoint = {
    time: number;
    x: number;
    y: number;
    confidence: number;
};
export type FramingConfig = {
    ratio: 'vertical' | 'square' | 'original';
    mode: 'auto' | 'fill' | 'blur' | 'fit';
    x: number;
    y: number;
    zoom: number;
    punch: boolean;
};
export type AppearanceLook = 'natural' | 'soft' | 'vivid' | 'warm' | 'mono' | 'cool';
export type AppearanceConfig = {
    look: AppearanceLook;
    intensity: number;
};
export type ExportConfig = {
    quality: 720 | 1080;
    fps: 30;
};
export type ExportResult = {
    blob: Blob;
    url: string;
    name: string;
    width: number;
    height: number;
    duration: number;
    audio: boolean;
    size: number;
};
export type Project = {
    id: string;
    source: SourceMedia;
    metadata: Metadata;
    waveform: WaveformData;
    pauses: Pause[];
    overrides: Record<string, boolean>;
    cutPreset: CutPreset;
    cutConfig?: CutConfig;
    /** Per-cut manual boundary changes in seconds. */
    cutAdjustments: Record<string, { startDelta: number; endDelta: number }>;
    /** Legacy model fields are ignored when opening older projects. */
    speechSegments?: SpeechSegment[];
    speechPauses?: Pause[];
    speechStatus?: SpeechAnalysisStatus;
    sensitivity: number;
    words: TranscriptWord[];
    captions: CaptionConfig;
    audio: AudioConfig;
    audioStats?: AudioStats;
    sourceAudioStats?: AudioStats;
    framing: FramingConfig;
    appearance?: AppearanceConfig;
    recording?: {
        scriptId: string;
        takeId: string;
        scriptTitle: string;
        scriptText: string;
        startWord: number;
        look?: string;
        lookIntensity?: number;
        portraitEffects?: {
            backgroundBlur: number;
            skinSmoothing: number;
        };
    };
    faces: FacePoint[];
    exportConfig: ExportConfig;
};
export type Capabilities = {
    decode: boolean;
    encode: boolean;
    audioDecode: boolean;
    audioEncode: boolean;
    webgpu: boolean;
    offscreen: boolean;
    memory: number | null;
    constrained: boolean;
    inApp: boolean;
    supported720: boolean;
    supported1080: boolean;
    reason?: string;
};
