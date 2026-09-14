# Phone flow verification

Checked on 14 September 2026 on Windows with Node v24.0.0, Chromium 1.63.0,
and `/creator-autoedit/`. Controlled fake camera and microphone flags were used
only by the browser tests; no physical device was opened.

Static checks currently pass: `npm run lint`, `npm run typecheck`, and
`npm test` (18 files, 143 tests). The latest phone flow browser check passes
4/4: Script opens without media permission, Continue opens a full 390×844
portrait camera surface, the native stream has live audio/video tracks at
1080×1920, stopping opens a ready playable review take, and Retake, Back,
Keep & continue, Editor Back, and landscape 844×390 layout all work.

The checked-in flow test is
[phone-flow-navigation.spec.ts](../teleprompter-e2e/phone-flow-navigation.spec.ts).
Settled evidence is in [phone-flow-evidence](phone-flow-evidence/), including
Script, Review, and landscape screenshots. Existing recording tests cover the
native MediaRecorder and durable IndexedDB engine; editor export checks remain
codec-dependent and are reported separately in `QA_REPORT.md`.

The current build removes local AI/model paths. There are no model packages,
workers, model domains in CSP, or runtime model assets in the source or built
artifact. [SOURCES_ORIGIN_UI.md](SOURCES_ORIGIN_UI.md) records the Origin UI NG
adaptation at commit `d785a610f510f5197a145f8c1a24249309bacd2d`; Angular source
is adapted to the existing React/Radix runtime.

Physical iOS, Android, and macOS acceptance, long recordings, thermal behavior,
browser-specific camera controls, and absolute crash-tail recovery are
untested or unavailable. Browser storage eviction and a crash can still lose
an unflushed recording tail. Teeth enhancement and a browser thermal sensor are
not supported.
