import type { Capabilities } from '../../types/project';
export async function supportedAvc(width: number, height: number): Promise<string | null> {
    if (typeof VideoEncoder === 'undefined')
        return null;
    for (const codec of ['avc1.420028', 'avc1.4d0028', 'avc1.640028']) {
        try {
            const result = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: width >= 1080 ? 5000000 : 2400000, framerate: 30, avc: { format: 'avc' } });
            if (result.supported)
                return codec;
        }
        catch { /* Probe the next profile, not user-agent assumptions. */ }
    }
    return null;
}
export async function getCapabilities(): Promise<Capabilities> {
    const memory = (navigator as Navigator & {
        deviceMemory?: number;
    }).deviceMemory ?? null;
    const mobile = matchMedia('(pointer: coarse)').matches;
    const inApp = /Instagram|FBAN|FBAV|TikTok|Bytedance|musical_ly/i.test(navigator.userAgent);
    const [small, large] = await Promise.all([supportedAvc(720, 1280), supportedAvc(1080, 1920)]);
    const decode = typeof VideoDecoder !== 'undefined', encode = Boolean(small);
    return { decode, encode, audioDecode: typeof AudioDecoder !== 'undefined', audioEncode: typeof AudioEncoder !== 'undefined', webgpu: 'gpu' in navigator, offscreen: typeof OffscreenCanvas !== 'undefined', memory, constrained: mobile || !!(memory && memory <= 4), inApp, supported720: !!small, supported1080: !!large,
        reason: !decode ? 'This browser cannot decode video for local editing. Open this page in an up-to-date Safari or Chrome browser.' : !encode ? 'MP4 export is not available in this browser. Open this page in an up-to-date Safari or Chrome browser.' : undefined };
}
