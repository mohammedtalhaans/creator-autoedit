# Changelog

## 0.9.0-rc.2 — 2026-09-12

**Source release candidate, not production-certified.**

### Correctness and lifecycle
- Continuous source-clock audio resampling with filter history across decoder packets.
- Exact handling of delayed audio, negative priming and real packet gaps.
- Stale voice/face/analysis results are guarded; manual crop overrides cancel competing work.
- Worker results, errors, malformed messages, clone failures and cancellation clean up their resources.
- Actionable error messages survive UI error handling.
- Caption model revision pinned; blocked/full caches degrade gracefully.
- Manual crop dragging uses real source/viewport/zoom geometry.
- Raw-audio fallback when enhanced preview audio fails or is not yet ready.

### Export
- Probe exact AAC output parameters, register official fallback lazily, then re-probe.
- Validate AVC/AAC tracks, output size, dimensions, duration and per-track timing.
- Re-decode three small frames from the finished MP4 before offering it to save.
- Validation remains cancellable and closes its media input.

### Verification and interface
- Core assertions increased from 66 to **135**, all passing in the alternate Node runner.
- **14** dependency-free TypeScript roots pass strict checking; **68** files parse.
- **21** actual source UI/Canvas/native-preview checks pass with substituted presentation libraries.
- Added built-site subpath/no-audio export tests and opt-in real-model acceptance tests.
- Release Chromium codec checks fail instead of silently skipping required export support.
- More legible technical labels, better phone touch targets, wrapped caption preset samples.
- **25** fresh, watermarked screenshots covering desktop and phone layouts and state fixtures.

### Still blocked
Installed dependency/build, real encoder/ML integration, physical Safari/Android QA, license audit and Pages deployment have not passed. The release gate remains blocked. See QA_REPORT.md.

The VPS is now online and responds to ping. This chat still lacks the connector’s terminal/file-write actions, so no remote install or build is claimed.
