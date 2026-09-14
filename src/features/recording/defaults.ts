import type { CaptureSettings, PromptSettings } from '../../types/recording';

/**
 * Safe starting values for a new script. These are deliberately plain data so
 * they can be structured-cloned into IndexedDB and into a take snapshot.
 */
export const defaultPromptSettings: PromptSettings = {
  mode: 'fixed',
  wpm: 140,
  targetSeconds: 90,
  fontSize: 48,
  fontFamily: 'DM Sans Variable',
  bold: false,
  lineHeight: 1.35,
  letterSpacing: 0,
  columnWidth: 78,
  margin: 7,
  marginLeft: 7,
  marginRight: 7,
  horizontalPosition: 0.5,
  readingLine: 16,
  textColor: '#f7f4ec',
  backgroundColor: '#111111',
  backgroundOpacity: 0.92,
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
  look: 'natural',
  lookIntensity: 0,
  controls: {},
  portraitEffects: { backgroundBlur: 0, skinSmoothing: 0 },
};

export function clonePromptSettings(settings: PromptSettings = defaultPromptSettings): PromptSettings {
  return { ...defaultPromptSettings, ...structuredClone(settings) };
}

export function cloneCaptureSettings(settings: CaptureSettings = defaultCaptureSettings): CaptureSettings {
  const effects: NonNullable<CaptureSettings['portraitEffects']> = settings.portraitEffects ?? { backgroundBlur: 0, skinSmoothing: 0 };
  const baseEffects: NonNullable<CaptureSettings['portraitEffects']> = defaultCaptureSettings.portraitEffects ?? { backgroundBlur: 0, skinSmoothing: 0 };
  return {
    ...defaultCaptureSettings,
    ...structuredClone(settings),
    controls: { ...defaultCaptureSettings.controls, ...(settings.controls ?? {}) },
    portraitEffects: {
      backgroundBlur: Number.isFinite(effects.backgroundBlur) ? effects.backgroundBlur : baseEffects.backgroundBlur,
      skinSmoothing: Number.isFinite(effects.skinSmoothing) ? effects.skinSmoothing : baseEffects.skinSmoothing,
    },
  };
}
