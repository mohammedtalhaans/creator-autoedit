# Current verification

Checked 13 September 2026 on the Windows host in this workspace. This file records fresh evidence for the intact source tree; the historical [QA_REPORT.md](../QA_REPORT.md) remains the record of the earlier uninstalled source review.

## Source and dependency baseline

- `DELIVERY_MANIFEST.json`: 145 of 145 listed files present; every manifest byte count and SHA-256 matched at the check time.
- `package-lock.json`: present and used by `npm ci`; final SHA-256 `63b4a1ec9f385bd34fc004ee5fb7782ffa69a4c2615ecebfadd58e0c774841f6` (210,240 bytes).
- Node `v24.0.0`, npm `11.3.0`, Playwright `1.63.0`.
- `npm run typecheck`: passed.
- `npm test`: 15 files, 135 tests passed.
- `npm run build`: passed and produced `dist` (the Pages artifact is generated from this output).
- `npm run lint`: passed with the final source merge.

The old downloaded archive under `Downloads/creator-autoedit-zip-20260912-1658` contained an incomplete/corrupt copy. The current checked-out source has passed the manifest integrity check, so the episode pack no longer carries that archive as a recording blocker. This does not certify the application or any physical device.

## Browser evidence

The current Chromium production run used the built app at `/creator-autoedit/` and passed four tests: deployment-subpath smoke, malformed-file recovery, real with-audio UI export, and real no-audio UI export. The with-audio output was decoded and independently inspected with ffprobe: H.264/AVC video, AAC-LC mono audio, 720×1280, 4.608 seconds container duration, 279,344 bytes. The no-audio output was H.264/AVC video only, 720×1280, 2.000 seconds, 97,676 bytes. The browser test also checked rendered dimensions, playback samples, non-black decoded pixels, and no non-GET network writes.

The development fixture's caption-enabled export was inspected in the browser and recorded 138 video frames, 216 AAC samples, four of four non-black frame samples, and 19 pixels matching the fixture caption palette. Its timings are explicit fixture timings, so this proves caption rendering pixels only; it does not prove Whisper inference.

The bounded Chromium model checks also passed: RNNoise returned a finite 288,000-sample denoised signal with mean sample difference `0.02839`; Whisper CPU/q8 returned 12 finite, monotonic timed words (including “your best ideas deserve…”; one later phrase was misheard and needs review); and MediaPipe returned real first/last detections at confidence `0.627` and `0.639` with endpoint movement `0.340`. The middle fixture sample intentionally returned confidence `0` and held the previous position, exercising the documented missed-detection fallback. A separate built-site run under the production CSP and `/creator-autoedit/` produced the real caption phrase “your best ideas deserve to be” and made two same-origin vision runtime requests plus one face-model request.

Development fixture tests passed in Chromium: five tests, including real with-audio and no-audio Mediabunny exports, review-control timing preservation, and caption/project state changes. WebKit development passed the two non-export checks and reported the three native export-dependent tests as skipped because the codec probe is unavailable. WebKit production passed the deployment-subpath smoke and reported malformed-file/export tests as skipped for the same codec limitation. These skips are compatibility observations, not device acceptance.

Screenshots and the exact small MP4 outputs are in [current-evidence](current-evidence/README.md). They were captured from the real built UI and are intentionally kept small; Playwright caches and full reports are not part of the evidence pack.

## Certification scope

The GitHub Pages workflow now deploys a browser-verified preview only after `npm ci`, lint, typecheck, unit tests, build, and mandatory Chromium production tests pass. `npm run verify:release` remains a separate full-certification check and still requires explicit physical-device, network/privacy, license, and real talking-head evidence; the model/runtime gate can now cite the Chromium model records above but does not imply device coverage. No GitHub repository was published from this workspace.
