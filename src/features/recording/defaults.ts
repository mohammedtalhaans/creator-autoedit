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
  verticalPosition: 18,
  textAlign: 'left',
  showPrompt: true,
  showReadingLine: true,
  readingLine: 16,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.38,
  showBackground: true,
  backgroundBlur: 0,
  textShadow: true,
  textOutline: false,
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
  screenLight: true,
  screenLightIntensity: 0.72,
  screenLightTone: 'neutral',
  framingMode: 'fill',
  framingVersion: 2,
  rotation: 'auto',
  controls: {},
};

export function clonePromptSettings(settings: PromptSettings = defaultPromptSettings): PromptSettings {
  const cloned = structuredClone(settings) as PromptSettings & { windowHeight?: unknown; verticalPosition?: unknown; textAlign?: unknown; showPrompt?: unknown; showReadingLine?: unknown; showBackground?: unknown; backgroundBlur?: unknown; textShadow?: unknown; textOutline?: unknown };
  const rawWindowHeight = typeof cloned.windowHeight === 'number' && Number.isFinite(cloned.windowHeight) ? cloned.windowHeight : defaultPromptSettings.windowHeight;
  const rawVerticalPosition = typeof cloned.verticalPosition === 'number' && Number.isFinite(cloned.verticalPosition) ? cloned.verticalPosition : defaultPromptSettings.verticalPosition;
  const rawBackgroundBlur = typeof cloned.backgroundBlur === 'number' && Number.isFinite(cloned.backgroundBlur) ? cloned.backgroundBlur : defaultPromptSettings.backgroundBlur;
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
    verticalPosition: Math.max(8, Math.min(58, rawVerticalPosition)),
    textAlign: isLegacyDefault ? defaultPromptSettings.textAlign : cloned.textAlign === 'center' ? 'center' : 'left',
    showPrompt: typeof cloned.showPrompt === 'boolean' ? cloned.showPrompt : defaultPromptSettings.showPrompt,
    showReadingLine: isLegacyDefault ? defaultPromptSettings.showReadingLine : typeof cloned.showReadingLine === 'boolean' ? cloned.showReadingLine : defaultPromptSettings.showReadingLine,
    showBackground: typeof cloned.showBackground === 'boolean' ? cloned.showBackground : defaultPromptSettings.showBackground,
    backgroundBlur: Math.max(0, Math.min(24, rawBackgroundBlur)),
    textShadow: typeof cloned.textShadow === 'boolean' ? cloned.textShadow : defaultPromptSettings.textShadow,
    textOutline: typeof cloned.textOutline === 'boolean' ? cloned.textOutline : defaultPromptSettings.textOutline,
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
  // Versionless rows used Full view as the app default. Move them once to the
  // phone-first no-bars default; settings changed after this release retain
  // the user's explicit framing choice through framingVersion.
  const framingMode = capture.framingVersion === 2
    ? capture.framingMode === 'fit' ? 'fit' : 'fill'
    : 'fill';
  const rotation = capture.rotation === 0 || capture.rotation === 90 || capture.rotation === 270 ? capture.rotation : 'auto';
  const screenLightIntensity = typeof capture.screenLightIntensity === 'number' && Number.isFinite(capture.screenLightIntensity)
    ? Math.max(0.2, Math.min(1, capture.screenLightIntensity))
    : defaultCaptureSettings.screenLightIntensity;
  const screenLightTone = capture.screenLightTone === 'cool' || capture.screenLightTone === 'warm' ? capture.screenLightTone : 'neutral';
  return {
    ...defaultCaptureSettings,
    ...capture,
    framingMode,
    framingVersion: 2,
    rotation,
    screenLight: typeof capture.screenLight === 'boolean' ? capture.screenLight : defaultCaptureSettings.screenLight,
    screenLightIntensity,
    screenLightTone,
    controls: { ...defaultCaptureSettings.controls, ...(capture.controls ?? {}) },
  };
}
