import { describe, expect, it } from 'vitest';
import { defaultCaptureSettings, defaultPromptSettings, cloneCaptureSettings, clonePromptSettings } from './defaults';
import { buildMediaConstraints, previewTransform, resolutionConstraints, resolveCaptureTransform, trackSettings } from './capture';

function streamWithSettings(video: Record<string, unknown>, audio: Record<string, unknown> = {}): MediaStream {
  return {
    getVideoTracks: () => [{ getSettings: () => video }],
    getAudioTracks: () => [{ getSettings: () => audio }],
  } as unknown as MediaStream;
}

describe('capture orientation negotiation', () => {
  it('requests portrait dimensions using resolution as the short edge in Full view', () => {
    const settings = { ...defaultCaptureSettings, portrait: true, resolution: 1080 as const, facingMode: 'user' as const, framingMode: 'fit' as const };
    const size = resolutionConstraints(settings);
    expect(size.width?.ideal).toBe(1080);
    expect(size.height?.ideal).toBe(1920);
    const constraints = buildMediaConstraints(settings);
    const video = constraints.video as MediaTrackConstraints;
    expect(video.aspectRatio).toBeUndefined();
    expect(video.resizeMode).toEqual({ ideal: 'none' });
    expect(video.facingMode).toEqual({ ideal: 'user' });
  });

  it('inverts dimensions and aspect ratio for landscape Full view', () => {
    const settings = { ...defaultCaptureSettings, portrait: false, resolution: 720 as const, cameraId: 'camera-1', framingMode: 'fit' as const };
    const size = resolutionConstraints(settings);
    expect(size.width?.ideal).toBe(1280);
    expect(size.height?.ideal).toBe(720);
    const video = buildMediaConstraints(settings).video as MediaTrackConstraints;
    expect(video.aspectRatio).toBeUndefined();
    expect(video.resizeMode).toEqual({ ideal: 'none' });
    expect(video.deviceId).toEqual({ exact: 'camera-1' });
  });

  it('asks the browser to crop and scale a native portrait stream in Fill mode', () => {
    const settings = { ...defaultCaptureSettings, portrait: true, framingMode: 'fill' as const };
    const video = buildMediaConstraints(settings).video as MediaTrackConstraints;
    expect(video.aspectRatio).toEqual({ ideal: 9 / 16 });
    expect(video.resizeMode).toEqual({ ideal: 'crop-and-scale' });
  });

  it('uses no-bars portrait fill by default and migrates versionless stored settings once', () => {
    expect(defaultCaptureSettings.framingMode).toBe('fill');
    expect(defaultCaptureSettings.framingVersion).toBe(2);
    const legacyFullView = { ...defaultCaptureSettings, framingMode: 'fit' as const };
    delete legacyFullView.framingVersion;
    expect(cloneCaptureSettings(legacyFullView).framingMode).toBe('fill');
    expect(cloneCaptureSettings({ ...defaultCaptureSettings, framingMode: 'fit' }).framingMode).toBe('fit');
  });

  it('persists negotiated source dimensions and orientation metadata', () => {
    const actual = trackSettings(streamWithSettings({ width: 1280, height: 720, facingMode: 'user' }, { channelCount: 1 }));
    expect(actual.video).toMatchObject({ width: 1280, height: 720, displayWidth: 1280, displayHeight: 720, orientation: 'landscape', displayOrientation: 'landscape', aspectRatio: 1280 / 720, facingMode: 'user' });
    expect(actual.audio).toMatchObject({ channelCount: 1 });
  });

  it('strips legacy appearance/model settings when cloning old rows', () => {
    const legacy = { ...defaultCaptureSettings, look: 'soft', lookIntensity: 0.8, portraitEffects: { backgroundBlur: 1, skinSmoothing: 1 } } as never;
    const cloned = cloneCaptureSettings(legacy);
    expect(cloned).not.toHaveProperty('look');
    expect(cloned).not.toHaveProperty('lookIntensity');
    expect(cloned).not.toHaveProperty('portraitEffects');
  });

  it('migrates only the exact previous prompt defaults and preserves custom settings', () => {
    const legacy = {
      ...defaultPromptSettings,
      fontSize: 48,
      lineHeight: 1.35,
      columnWidth: 78,
      backgroundOpacity: 0.92,
      textColor: '#f7f4ec',
      backgroundColor: '#111111',
    } as never;
    const migrated = clonePromptSettings(legacy);
    expect(migrated.fontSize).toBe(38);
    expect(migrated.lineHeight).toBe(1.25);
    expect(migrated.columnWidth).toBe(86);
    expect(migrated.backgroundOpacity).toBe(0.38);
    const custom = clonePromptSettings({ ...legacy, wpm: 141 });
    expect(custom.fontSize).toBe(48);
    expect(custom.lineHeight).toBe(1.35);
    expect(custom.columnWidth).toBe(78);
    expect(custom.backgroundOpacity).toBe(0.92);
    expect(clonePromptSettings({ ...defaultPromptSettings, windowHeight: 99 }).windowHeight).toBe(65);
    expect(clonePromptSettings({ ...defaultPromptSettings, windowHeight: 1 }).windowHeight).toBe(20);
  });

  it('keeps the full landscape source inside a portrait canvas when Full view is selected', () => {
    const transform = resolveCaptureTransform({ sourceWidth: 1920, sourceHeight: 1080, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 0, framingMode: 'fit' });
    expect(transform.rotation).toBe(0);
    expect(transform.contentRect.width).toBeCloseTo(1080);
    expect(transform.contentRect.height).toBeCloseTo(607.5);
    expect(transform.contentRect.x).toBeCloseTo(0);
    expect(transform.contentRect.y).toBeCloseTo(656.25);
    expect(transform.contentRect.x + transform.contentRect.width).toBeLessThanOrEqual(transform.targetWidth);
    expect(transform.contentRect.y + transform.contentRect.height).toBeLessThanOrEqual(transform.targetHeight);
  });

  it('uses an explicit Fill mode to crop the source edges', () => {
    const full = resolveCaptureTransform({ sourceWidth: 1920, sourceHeight: 1080, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 0, framingMode: 'fit' });
    const fill = resolveCaptureTransform({ sourceWidth: 1920, sourceHeight: 1080, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 0, framingMode: 'fill' });
    expect(full.contentRect.width).toBeLessThan(1920);
    expect(fill.contentRect.width).toBeGreaterThan(1080);
    expect(fill.contentRect.height).toBeCloseTo(1920);
    expect(fill.contentRect.x).toBeLessThan(0);
  });

  it('does not infer rotation from landscape dimensions alone', () => {
    const transform = resolveCaptureTransform({ sourceWidth: 1920, sourceHeight: 1080, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 'auto', framingMode: 'fit' });
    expect(transform.rotation).toBe(0);
    expect(transform.displayWidth).toBe(1920);
    expect(transform.displayHeight).toBe(1080);
    expect(transform.contentRect).toMatchObject({ x: 0, y: 656.25, width: 1080, height: 607.5 });
  });

  it('centers a landscape 4:3 source without rotating it in Auto', () => {
    const transform = resolveCaptureTransform({ sourceWidth: 640, sourceHeight: 480, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 'auto', framingMode: 'fit' });
    expect(transform.rotation).toBe(0);
    expect(transform.scale).toBeCloseTo(1.6875);
    expect(transform.drawWidth).toBeCloseTo(1080);
    expect(transform.drawHeight).toBeCloseTo(810);
    expect(transform.offsets).toEqual({ x: 0, y: 555 });
    expect(transform.contentRect).toEqual({ x: 0, y: 555, width: 1080, height: 810 });
  });

  it('crops only when Fill view is explicitly selected', () => {
    const transform = resolveCaptureTransform({ sourceWidth: 640, sourceHeight: 480, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 'auto', framingMode: 'fill' });
    expect(transform.rotation).toBe(0);
    expect(transform.scale).toBe(4);
    expect(transform.drawWidth).toBe(2560);
    expect(transform.drawHeight).toBe(1920);
    expect(transform.offsetX).toBe(-740);
    expect(transform.offsetY).toBe(0);
  });

  it('honours manual zero rotation and keeps Full view unzoomed', () => {
    const transform = resolveCaptureTransform({ sourceWidth: 1920, sourceHeight: 1080, targetWidth: 1080, targetHeight: 1920, requestedPortrait: true, rotation: 0, framingMode: 'fit' });
    expect(transform.rotation).toBe(0);
    expect(transform.scale).toBeCloseTo(0.5625);
    expect(transform.drawWidth).toBe(1080);
    expect(transform.drawHeight).toBeCloseTo(607.5);
    expect(transform.offsetY).toBeCloseTo(656.25);
  });

  it('leaves a landscape source unrotated when the requested target is landscape', () => {
    const transform = resolveCaptureTransform({ sourceWidth: 1280, sourceHeight: 720, targetWidth: 1920, targetHeight: 1080, requestedPortrait: false, rotation: 'auto', framingMode: 'fit' });
    expect(transform.rotation).toBe(0);
    expect(transform.scale).toBe(1.5);
    expect(transform.contentRect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('uses the same resolved transform for preview descriptors', () => {
    const settings = { ...defaultCaptureSettings, portrait: true, framingMode: 'fit' as const, rotation: 'auto' as const };
    const transform = previewTransform(settings, { video: { width: 640, height: 480 } }, 640, 480);
    expect(transform.rotation).toBe(0);
    expect(transform.contentRect).toEqual({ x: 0, y: 555, width: 1080, height: 810 });
  });

  it('uses explicit camera rotation metadata in Auto mode', () => {
    const settings = { ...defaultCaptureSettings, portrait: true, framingMode: 'fit' as const, rotation: 'auto' as const };
    const transform = previewTransform(settings, { video: { width: 640, height: 480, rotation: 90 } }, 640, 480);
    expect(transform.rotation).toBe(90);
    expect(transform.contentRect).toEqual({ x: 0, y: 240, width: 1080, height: 1440 });
  });
});
