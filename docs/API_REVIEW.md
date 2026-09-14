# API review notes — 12 September 2026

This is a source-level review, not evidence of an installed build. The exact resolved packages, runtime binaries and transitive licenses still need verification. Package ranges are not a substitute for a reviewed lockfile.

| Area | Official reference | Integration decision / outstanding proof |
|---|---|---|
| Media reading | https://mediabunny.dev/guide/reading-media-files | File-backed input; track timestamps drive the source clock. Validate actual rotated/VFR phone files. |
| Sample decoding | https://mediabunny.dev/guide/media-sinks | Audio samples and pooled Canvas surfaces; close samples promptly. Real decoder integration remains untested. |
| Encoding | https://mediabunny.dev/guide/media-sources | CanvasSource and AudioSampleSource, timestamped adds with awaited backpressure. Test AVC/AAC output and final short frames. |
| Codec probing | https://mediabunny.dev/guide/supported-formats-and-codecs | Probe the actual requested AAC parameters; lazy official fallback, then re-probe. Browser availability must not be inferred from user agent. |
| Transformers runtime | https://huggingface.co/docs/transformers.js/en/guides/webgpu | This release uses the CPU/WASM q8 path for reliable word timestamps; no WebGPU capability claim is made. |
| Transformers environment | https://huggingface.co/docs/transformers.js/api/env | Local WASM paths and an application-specific model cache; cache failure must not block transcription. |
| Selected speech model | https://huggingface.co/Xenova/whisper-tiny.en | Tiny English ONNX conversion. The model card documents Transformers.js word-level timestamps and declares Apache-2.0; upstream Whisper remains MIT. |
| Pinned conversion | https://huggingface.co/Xenova/whisper-tiny.en/commit/79fb389fc764e7c395bd330e9531d9d32ada7049 | Source constant pins this immutable revision. Verify retrieved artifact hashes and applicable notices before redistribution. |
| Underlying Whisper | https://github.com/openai/whisper/blob/main/LICENSE | MIT upstream; do not treat that alone as a completed conversion-artifact audit. No hosted API is used. |
| RNNoise wrapper | https://github.com/shiguredo/rnnoise-wasm | Load module, create state, process frames in place, destroy state. Measure actual filter delay and listen to output. |
| MediaPipe | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js | Worker detection and conservative frame sampling; test actual installed runtime/CSP/network behavior. |
| Static deployment | https://vite.dev/guide/static-deploy.html#github-pages | Repository-relative base and Pages workflow. Run the built-site subpath tests and the deployed URL smoke check. |

Source and regression tests were updated following this review. None of these reference links should be read as a claim that the production libraries were installed or that inference/export succeeded in the supplied environment.
