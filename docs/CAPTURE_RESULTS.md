# Capture engine results

The capture engine now exposes `recordingLibrary`, `recorder`,
`defaultPromptSettings`, `defaultCaptureSettings`, `stitchTakes`, and
`selectBestTakes` from `src/features/recording`.

Capture persists a take manifest before `MediaRecorder.start()`. Non-empty
chunks are written to IndexedDB in sequence order through awaited, serialized
transactions. A take is reported as complete only after the final `dataavailable`
event, all chunk writes, and Mediabunny video/audio playback validation finish.
The requested camera and microphone are both required, and the manifest records
the actual negotiated track settings and the MIME type reported by
`MediaRecorder`.

If IndexedDB fails, the recorder surfaces an error immediately and retains the
captured failure tail for an explicit recovery download through
`recorder.getRecoveryBlob()`. The original manifest and chunks are never
silently replaced. A stale recording lease can be recovered by
`recoverInterrupted()`; a recent heartbeat is left alone so a second tab cannot
claim a live take. Browser eviction, crashes before a chunk is flushed, hidden
page scheduling, and device unplugging remain honest partial-recording states;
the engine does not promise zero data loss.

Assembly decodes each selected take, normalizes dimensions and audio to a common
rate, then encodes a new MP4. The originals remain available. If this browser
cannot decode one of the inputs or encode normalized H.264/AAC output, the
operation fails with an actionable error instead of concatenating incompatible
bytes.

## Verification

Run the existing unit suite with `npm test` and the application typecheck with
`npm run typecheck`. Browser capture verification must use Playwright's fake
camera/microphone flags and an actual `MediaRecorder`; the real webcam is never
opened by automated tests. Record the resulting MP4/WebM MIME type, video/audio
tracks, duration, and reload/recovery outcome in the test report when the
browser test is enabled.

The controlled Chromium check currently passes with one test: two native
MediaRecorder takes produce non-empty WebM media, both video and microphone
audio decode after a page reload, and a Mediabunny stitch output decodes with a
combined duration. The recording unit tests pass seven cases covering ordered
chunk transactions, reload, stale versus live writer leases, script deletion,
settings cloning, take ordering, and metadata immutability. This evidence uses
fake media only and does not establish physical device support.
