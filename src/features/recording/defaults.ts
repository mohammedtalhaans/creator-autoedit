import type { CaptureSettings, PromptSettings } from '../../types/recording';

/**
 * Safe starting values for a new script. These are deliberately plain data so
 * they can be structured-cloned into IndexedDB and into a take snapshot.
 */
export const defaultPromptSettings: PromptSettings = {
  mode: 'fixed',
  wpm: 140,
  targetSeconds: 90,
  fontSize: 38,
  fontFamily: 'DM Sans Variable',
  bold: false,
  lineHeight: 1.25,
  letterSpacing: 0,
  columnWidth: 86,
  margin: 7,
  marginLeft: 7,
  marginRight: 7,
  horizontalPosition: 0.5,
  windowHeight: 34,
  textAlign: 'left',
  showReadingLine: true,
  readingLine: 16,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.38,
  mirror: false,
  highContrast: true,
  dimSurrounding: true,
  autoPause: true,
  lineTiming: false,
  voiceSensitivity: 0.42,
  punctuation: true,
  commaPause: 0.15,
  periodPause: 0.35,
  paragraphPause: 0.7,
};

/** Capture defaults favour a broadly supported 1080p/30fps video recording. */
export const defaultCaptureSettings: CaptureSettings = {
  cameraId: '',
  microphoneId: '',
  facingMode: 'user',
  resolution: 1080,
  fps: 30,
  portrait: true,
  monitorAudio: false,
  framingMode: 'fit',
  rotation: 'auto',
  controls: {},
};

export function clonePromptSettings(settings: PromptSettings = defaultPromptSettings): PromptSettings {
  const cloned = structuredClone(settings) as PromptSettings & { windowHeight?: unknown; textAlign?: unknown; showReadingLine?: unknown };
  const rawWindowHeight = typeof cloned.windowHeight === 'number' && Number.isFinite(cloned.windowHeight) ? cloned.windowHeight : defaultPromptSettings.windowHeight;
  const isLegacyDefault = cloned.fontSize === 48
    && cloned.lineHeight === 1.35
    && cloned.columnWidth === 78
    && cloned.backgroundOpacity === 0.92
    && cloned.textColor === '#f7f4ec'
    && cloned.backgroundColor === '#111111'
    && cloned.wpm === 140
    && cloned.targetSeconds === 90
    && cloned.fontFamily === 'DM Sans Variable'
    && cloned.bold === false
    && cloned.letterSpacing === 0
    && cloned.margin === 7
    && cloned.marginLeft === 7
    && cloned.marginRight === 7
    && cloned.horizontalPosition === 0.5
    && cloned.readingLine === 16
    && cloned.mirror === false
    && cloned.highContrast === true
    && cloned.dimSurrounding === true
    && cloned.autoPause === true
    && cloned.lineTiming === false
    && cloned.voiceSensitivity === 0.42
    && cloned.punctuation === true
    && cloned.commaPause === 0.15
    && cloned.periodPause === 0.35
    && cloned.paragraphPause === 0.7;
  return {
    ...defaultPromptSettings,
    ...cloned,
    ...(isLegacyDefault ? {
      fontSize: defaultPromptSettings.fontSize,
      lineHeight: defaultPromptSettings.lineHeight,
      columnWidth: defaultPromptSettings.columnWidth,
      backgroundOpacity: defaultPromptSettings.backgroundOpacity,
      textColor: defaultPromptSettings.textColor,
      backgroundColor: defaultPromptSettings.backgroundColor,
    } : {}),
    windowHeight: isLegacyDefault ? defaultPromptSettings.windowHeight : Math.max(20, Math.min(65, rawWindowHeight)),
    textAlign: isLegacyDefault ? defaultPromptSettings.textAlign : cloned.textAlign === 'center' ? 'center' : 'left',
    showReadingLine: isLegacyDefault ? defaultPromptSettings.showReadingLine : typeof cloned.showReadingLine === 'boolean' ? cloned.showReadingLine : defaultPromptSettings.showReadingLine,
  };
}

export function cloneCaptureSettings(settings: CaptureSettings = defaultCaptureSettings): CaptureSettings {
  // Older IndexedDB rows may still contain appearance/model fields. Pull the
  // data through structuredClone for safety, then explicitly omit those legacy
  // fields so they never re-enter the capture settings surface.
  const cloned = structuredClone(settings) as CaptureSettings & {
    look?: unknown;
    lookIntensity?: unknown;
    portraitEffects?: unknown;
    frameMode?: unknown;
  };
  const { look: _look, lookIntensity: _lookIntensity, portraitEffects: _portraitEffects, frameMode: _frameMode, ...capture } = cloned;
  const framingMode = capture.framingMode === 'fill' ? 'fill' : 'fit';
  const rotation = capture.rotation === 0 || capture.rotation === 90 || capture.rotation === 270 ? capture.rotation : 'auto';
  return {
    ...defaultCaptureSettings,
    ...capture,
    framingMode,
    rotation,
    controls: { ...defaultCaptureSettings.controls, ...(capture.controls ?? {}) },
  };
}
