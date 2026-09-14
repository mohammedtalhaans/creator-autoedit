# Teleprompter feature matrix

| User request category | Status | Evidence or boundary |
|---|---|---|
| Read-only rehearsal | Implemented and tested | Opens without `getUserMedia`; fixed, timed, manual, cursor selection, keyboard movement, and prompt pause are covered by the focused suite. |
| WPM, font, line, margins, colour, mirror, contrast | Implemented and tested | Inline reader settings preserve the active word; mirror affects the display layer and never rewrites raw capture bytes. |
| Voice-follow | Implemented and model-tested | Actual Silero VAD + Moonshine Tiny worker path, pause/resume, restart, matcher movement, backtracking guard, and stale-result guard are recorded in [PROMPT_MODEL_EVIDENCE.md](PROMPT_MODEL_EVIDENCE.md). |
| Script cues and timing | Implemented and unit-tested | Stage directions remain visible but are excluded from spoken WPM/matching; punctuation and cue pauses feed the shared timing path. |
| Script library, autosave, search, bookmark | Implemented and tested | IndexedDB persistence, immediate close/reopen, search, bookmark, and backup are covered. |
| TXT, Markdown, DOCX import | Implemented and tested | TXT and a valid DOCX package were imported through the UI; Mammoth remains lazy-loaded. |
| Local writing assist | Implemented and model-tested | Actual SmolLM2-135M generation, rewrite, Apply/Discard, and cancellation are recorded in the model evidence. |
| Camera + microphone capture | Implemented and tested | Native tracks and MediaRecorder produce validated playable media; fake devices are test-only. |
| Capture settings and manual hardware controls | Implemented, capability-dependent | Negotiated settings and exposed zoom/focus/exposure/torch controls use browser capabilities. Unsupported controls are reported. |
| Prompt overlay while recording | Implemented and tested | Compact reader overlays the live viewfinder, starts fixed/timed scrolling with capture, and pauses independently while recording continues. |
| Durable chunks and storage failure recovery | Implemented and tested | Manifest-before-start, ordered chunks, quota fallback, recovery download, stale-manifest recovery, and writer lease checks are covered. Crash-tail zero-loss is unavailable. |
| Takes, favourite, compare, retake, original download | Implemented and tested | Two native takes were retained independently and exercised through the library. |
| Stitching selected takes | Implemented in the recording feature; UI selection flow is capability-dependent | Decode/normalize/encode behavior is covered by recording tests; no claim is made for incompatible codecs or a seamless automatic edit. |
| Use in AutoEdit with script/look metadata | Implemented in source handoff | The take snapshot is mapped into flat editor metadata; editor ingest/export still depends on the browser's codec and local model capabilities. |
| Captions and speech-aware cuts | Implemented in the shared editor | See [CAPTION_RESULTS.md](CAPTION_RESULTS.md), [CAPTURE_RESULTS.md](CAPTURE_RESULTS.md), and [SOURCES_CAPTIONS.md](SOURCES_CAPTIONS.md). |
| Portrait blur and skin smoothing | Implemented, model and browser capability-dependent | Real MediaPipe category masks feed preview/export; raw camera bytes remain native. Physical-device quality is untested. |
| Offline after first shell load | Implemented and tested | Production SW shell reload and basic native recording work offline; local model preparation still needs its cached assets. |
| Privacy and network boundary | Implemented with bounded verification | No source-media POST/PUT was observed in focused tests. Static/model downloads still make ordinary GET requests; this is not a complete third-party runtime audit. |
| Physical iOS, Android, and macOS acceptance | Not tested | No emulation result is presented as physical-device certification. |
| Teeth enhancement, thermal sensor, guaranteed crash-tail recovery | Unsupported or unavailable | No inert controls are exposed; browser thermal APIs and absolute crash-loss guarantees are unavailable. |
