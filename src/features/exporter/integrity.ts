export type TrackIntegrity = { codec: string | null; start: number; end: number };
export type ExportIntegrity = {
    width: number; height: number; duration: number; bytes: number;
    video: TrackIntegrity | null; audio: TrackIntegrity | null;
};
/** Reject incomplete/wrong-codec exports before a Save button is ever shown.
 * AAC priming and final padded packets are allowed within a small explicit tolerance.
 */
export function validateExport(actual: ExportIntegrity, expected: { width: number; height: number; duration: number; audio: boolean }): void {
    const fail = () => { throw new Error('The exported file failed its integrity check. Please retry at Standard 720p.'); };
    if (!actual.video || actual.video.codec !== 'avc' || actual.width !== expected.width || actual.height !== expected.height || actual.bytes < 128) fail();
    if (!!actual.audio !== expected.audio || (actual.audio && actual.audio.codec !== 'aac')) fail();
    if (!Number.isFinite(actual.duration) || Math.abs(actual.duration - expected.duration) > .15) fail();
    for (const track of [actual.video, actual.audio]) {
        if (!track) continue;
        if (!Number.isFinite(track.start) || !Number.isFinite(track.end) || Math.abs(track.start) > .08 ||
            track.end <= track.start || Math.abs(track.end - expected.duration) > .15) fail();
    }
    if (actual.audio && actual.video && Math.abs(actual.audio.end - actual.video.end) > .15) fail();
}
