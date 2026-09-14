# Phone flow feature matrix

| Category | Status | Verification or boundary |
|---|---|---|
| Script → Record → Review → Edit | Implemented and tested | Sequential phone flow, immediate review, Back, Retake, Keep & continue, and Editor Back pass in Chromium. |
| Script library and autosave | Implemented and tested | IndexedDB scripts, search, bookmark, TXT/Markdown/DOCX import, backup, cursor/settings persistence. |
| Prompt timing | Implemented and tested | Fixed, timed, manual, WPM, font, line, margins, cues, keyboard movement, and pause/resume. No voice-follow mode. |
| Camera + microphone | Implemented and tested | Native `getUserMedia` and `MediaRecorder`; controlled fake devices only in tests. |
| Portrait capture and review | Implemented and tested | Negotiated portrait dimensions, playable review video, audio track, and safe-area controls. |
| Durable takes and recovery | Implemented and unit-tested | Manifest/chunks, ordered writes, stale recovery, quota recovery download, and original retention. Crash-tail zero-loss is unavailable. |
| Take actions | Implemented and tested | Retake, favourite, comparison, original download, and editor handoff. |
| AutoCut | Implemented and tested | Deterministic audio gate with conservative onset handles, per-cut Keep/Remove, and adjustable before/after handles. |
| Caption rendering | Capability-dependent | The renderer accepts supplied timed project words; no caption module or automatic transcription UI is exposed in this build. |
| Original audio | Implemented | Source audio is preserved, with short cut-seam ramps where the shared export path needs them; there is no voice-enhancement feature. |
| Framing and export | Implemented, browser-capability-dependent | Shared preview/export renderer and portrait output depend on native codec support. |
| Hardware controls | Capability-dependent | Only controls exposed by `getCapabilities()` and accepted by `applyConstraints()` are shown. |
| Offline shell | Implemented and tested after first load | Static app shell and IndexedDB recording can reload offline; no model cache is needed. |
| Privacy boundary | Implemented with bounded checks | No source-media POST/PUT path; static hosting and user-initiated downloads remain browser network actions. |
| Local AI, ML, voice-follow, model downloads | Not implemented by design | Removed from source, package lock, CSP, runtime assets, UI, and built bundle. |
| Physical iOS/Android/macOS certification | Not tested | No emulator or desktop Chromium result is presented as physical-device certification. |
| Teeth enhancement, thermal sensor, absolute crash guarantee | Unsupported or unavailable | No inert controls are exposed; browser thermal APIs and zero-loss crash guarantees do not exist here. |
