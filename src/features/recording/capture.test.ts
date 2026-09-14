import { describe, expect, it } from 'vitest';
import { defaultCaptureSettings, cloneCaptureSettings } from './defaults';
import { buildMediaConstraints, resolutionConstraints, trackSettings } from './capture';

function streamWithSettings(video: Record<string, unknown>, audio: Record<string, unknown> = {}): MediaStream {
  return {
    getVideoTracks: () => [{ getSettings: () => video }],
    getAudioTracks: () => [{ getSettings: () => audio }],
  } as unknown as MediaStream;
}

describe('capture orientation negotiation', () => {
  it('requests portrait dimensions using resolution as the short edge', () => {
    const settings = { ...defaultCaptureSettings, portrait: true, resolution: 1080 as const, facingMode: 'user' as const };
    const size = resolutionConstraints(settings);
    expect(size.width?.ideal).toBe(1080);
    expect(size.height?.ideal).toBe(1920);
    const constraints = buildMediaConstraints(settings);
    const video = constraints.video as MediaTrackConstraints;
    expect(video.aspectRatio).toEqual({ ideal: 9 / 16 });
    expect(video.facingMode).toEqual({ ideal: 'user' });
  });

  it('inverts dimensions and aspect ratio for landscape', () => {
    const settings = { ...defaultCaptureSettings, portrait: false, resolution: 720 as const, cameraId: 'camera-1' };
    const size = resolutionConstraints(settings);
    expect(size.width?.ideal).toBe(1280);
    expect(size.height?.ideal).toBe(720);
    const video = buildMediaConstraints(settings).video as MediaTrackConstraints;
    expect(video.aspectRatio).toEqual({ ideal: 16 / 9 });
    expect(video.deviceId).toEqual({ exact: 'camera-1' });
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
});
