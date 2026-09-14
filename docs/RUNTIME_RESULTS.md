# Runtime results — 13 September 2026

The dependency install completed with Node 24.0.0 using the isolated `npx npm@11.19.1 install --no-audit --no-fund` command. Registry metadata reports npm 11.19.1 supports Node `^20.17.0 || >=22.9.0`; npm 12.0.2 was not selected because its published engine range starts at Node 22.22.2 / 24.15.0. The install resolved the declared packages and generated `package-lock.json`.

Runtime corrections in this pass:

- `src/features/exporter/index.ts` now caches and awaits `Output.cancel()` during abort/error cleanup, so an interrupted Mediabunny output cannot outlive the export operation while its input and paged target are released.
- `src/features/face-track/index.ts` now handles worker error replies with explicit control flow and passes the installed ESLint rule.

Exact checks completed:

- `npm run typecheck` — passed.
- `npm test -- --reporter=dot` — 15 files, 135 tests passed. npm 11.19.1 emits a warning that `--reporter` is an unknown npm config; Vitest still received and used its reporter argument.
- `npm run build` — passed; `prepare:assets` copied 14 same-origin runtime files and 316 package notices, and Vite produced `dist`.
- `npm run test:e2e -- --project=chromium` — Chromium landing, compatibility, real 720p AVC/AAC export, real 720p video-only export, and project-control checks passed; the configured WebKit media checks skipped because that installed browser lacks the required native codec support. A codec skip is not device acceptance.

Known limits observed with the installed dependencies/browser harness:

- `npm run lint` still reports four UI/backup-file errors outside this runtime pass; the runtime-owned face-track error is corrected.
- Captions now select `Xenova/whisper-tiny.en` at immutable revision `79fb389fc764e7c395bd330e9531d9d32ada7049`, whose model card documents word timestamps and declares Apache-2.0. The supported production path is CPU/WASM q8, with no WebGPU claim. The installed Transformers.js 3.7.2 pairing resolves its published `onnxruntime-web@1.22.0-dev.20250409-89f8206ba4` dependency. A focused Chromium smoke on a fresh dev server returned real English words with finite monotonic word timestamps (`your`, `best`, `ideas`, `deserve`, `to`, `be`, `heard.`) and `accelerated:false`. The earlier Transformers 4.2.0 / ONNX Runtime 1.26.0 development pairing was rejected after its q8 missing-scale error and one fp32 context-destroying retry; no fabricated timestamps are used.
- RNNoise passed its actual model smoke. MediaPipe failed in the installed test runtime with `ModuleFactory not set`; that path is being handled separately. These results do not certify full model integration.
- No physical Android/iOS/macOS/Safari device run, thermal/memory profile, or GitHub Pages deployment was performed. The existing production CSP/local processing design was preserved.
