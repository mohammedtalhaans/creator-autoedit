# Local recording studio — implementation decisions

The experience is Script → Record → Takes → AutoEdit. Keep Signal Studio's existing visual identity. Recording and rehearsal must work without a model download; optional local speech/AI models are prepared explicitly and cached. Do not use cloud Web Speech recognition, external processing APIs, analytics, or accounts.

## Reuse

- Adapt the speech pipeline, latest-partial queue and matching algorithms from `larsbaunwall/promptme-ai` at `fe1de139b4266f5aac8edb9406c61a4ecf006d33`. Replace CDN imports with the existing pinned Transformers installation, same-origin WASM, explicit lazy initialization, one WASM thread, and bounded queues. No cross-origin-isolation reload workaround.
- Adapt reading/scroll timing and lens-position ideas from `kevinkissi/teleprompter` at `ec0fc7bfdf713efd9ad497761a892002230f0dab`. Keep provenance and license notices with adapted code. Exclude its bundled unrelated prose/library and peer networking.
- Reuse native MediaRecorder/getUserMedia for capture, IndexedDB for durable chunks/scripts/settings, existing Mediabunny for editing/assembly, and existing Transformers/MediaPipe for optional local inference.

## Capture and recovery

Native MediaRecorder captures the original camera/mic stream independently of script animation. Persist the take manifest before start; persist ordered chunks approximately every second with serialized, awaited transactions. Finalize only after the final data event and writes finish. A storage error must immediately show an actionable state and offer the captured data for download; never display Saved before commit. Recover interrupted manifests on startup, distinguish incomplete recoverable data from playable completed takes, and retain previous takes. Browser/OS crashes can still lose an unflushed tail, and browser storage can be evicted; offer persistence request and external downloads without promising zero loss.

Camera switching ends and saves the active take before changing devices. Do not mutate a native recording stream and pretend the result is seamless. Store source device preferences, actual settings, script snapshot, start token, and appearance settings on every take. Multiple recordings must never overwrite one another. Stitch selected takes in chosen order using real decoded media; originals remain available. Hardware controls use getCapabilities/applyConstraints and show actual negotiated values. Do not invent a browser thermal sensor, exposure/ISO/lens support, or 4K/60fps acceptance.

## Prompting

Fixed, timed, manual, and actual local voice-follow modes. Script tokens exclude stage directions from WPM and speech matching. All modes share one explicit cursor; selecting a word or bookmark resets matching history deliberately. Pause scrolling independently of recording. Speech gating uses hysteresis and a grace period; failed recognition holds position rather than jumping. Backtracking and distant jumps require multiword evidence. Keep the near-lens reading window visible while settings change in an inline panel; preserve scroll position on font/layout changes. Persist settings and cursor between takes.

## Captions and cuts

Add short-social-video visual styles (original presets, no proprietary assets): bold outline, word highlight, karaoke plate, minimal subtitle, editorial, neon accent. A 1–8 words-per-card option and 1–2 line setting must affect both preview and exported pixels. Expose typography, color, placement, outline, background and spacing inline. On mobile keep the preview visible above an inline settings region, never covered by a Type, colour & placement modal.

Add speech-aware pause removal with editable minimum silence and speech padding, protecting timestamped words. Keep energy detection as a clearly identified offline fallback. No detector guarantees every word or every pause; users can compare raw/edited and restore cuts. Appearance preview should preserve the native raw recording; edited exports must apply the selected supported look, with clear distinction from originals. Do not offer inert enhancement controls.

## Acceptance

Test real camera/microphone capture using controlled browser media, save/reload/recover, retakes and favourite selection, independent prompt pause, input switching, offline basic recording/rehearsal, caption preview/export consistency, voice matching recovery, silent/quiet/noisy speech, and mobile portrait/landscape editing panels. Retain real MP4 evidence and production subpath/CSP checks. Physical iOS/Android and hardware capabilities remain separately reported until actually tested.
