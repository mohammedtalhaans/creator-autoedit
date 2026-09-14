# Third-party notices and release obligations

This repository's original application code, artwork and demo text use the MIT license in `LICENSE`. That license does not relicense dependencies, machine-learning model weights, compiled codecs, fonts or other third-party material.

**Exact-version redistribution audit is incomplete.** Dependencies were not installable in the supplied environment. The package references below identify intended components and upstream declarations; installed artifacts and their transitive notices must be reviewed before release. `scripts/prepare-assets.mjs` collects actual installed license/NOTICE files and writes a version/hash manifest to the production public assets. Generated notices are not a substitute for reviewing binary/source distribution obligations.

| Component | Upstream / declared terms | Usage and obligations |
|---|---|---|
| React, React DOM | https://github.com/facebook/react — MIT | Rendering. Preserve installed license. |
| Vite / React plugin | https://github.com/vitejs/vite — MIT | Development/build tools. |
| TypeScript | https://github.com/microsoft/TypeScript — Apache-2.0 | Build/test tool. |
| Tailwind CSS | https://github.com/tailwindlabs/tailwindcss — MIT | CSS integration. |
| Radix primitives | https://github.com/radix-ui/primitives — MIT | Dialogs, sliders, switches, tooltips, Slot. |
| shadcn/ui conventions | https://github.com/shadcn-ui/ui — MIT | Themed, source-owned primitive patterns and component configuration; no claim that upstream defaults are shipped unchanged. |
| Motion | https://github.com/motiondivision/motion — MIT | Interaction and layout animation. |
| Lucide | https://github.com/lucide-icons/lucide — ISC, with upstream Feather notices | Interface icons. Preserve both applicable notices. |
| CVA / clsx / tailwind-merge | Their installed package repositories and notices — Apache-2.0 / MIT / MIT respectively | Class composition; verify actual installed declarations. |
| Mediabunny | https://github.com/Vanilagy/mediabunny — MPL-2.0 | Demux/decode, samples, codecs, mux. Preserve MPL notices and access to corresponding covered source. |
| `@mediabunny/aac-encoder` | Same upstream — MPL-2.0 wrapper; FFmpeg AAC implementation LGPL-2.1-or-later per upstream extension documentation | Lazy fallback only. Review exact shipped binary/source/build and relinking/source-offer requirements before redistribution. Not the general ffmpeg.wasm package. |
| Transformers.js | https://github.com/huggingface/transformers.js — Apache-2.0 | Local ASR pipeline. Preserve NOTICE where present. |
| ONNX Runtime | https://github.com/microsoft/onnxruntime — MIT and included third-party notices | JS/WASM inference binaries. Collect exact installed runtime notices. |
| `Xenova/whisper-tiny.en` | https://huggingface.co/Xenova/whisper-tiny.en — Apache-2.0 on the model card; upstream Whisper is MIT | Downloaded, not bundled. Pinned to immutable revision `79fb389fc764e7c395bd330e9531d9d32ada7049`. The model card documents Transformers.js word-level timestamps; confirm the exact downloaded artifacts and applicable notices before release. |
| Original Whisper model/code | https://github.com/openai/whisper — MIT | Base-model lineage; no OpenAI service or API is used. Preserve relevant model notices. |
| MediaPipe Tasks Vision | https://github.com/google-ai-edge/mediapipe — Apache-2.0 | Local face detector/runtime. Exact version 1.0.1 SDK behavior and notices need installed review. |
| BlazeFace short-range model | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector | Downloaded from Google's model hosting. Archive and verify the exact model's redistribution terms, provenance and checksum; do not assume documentation's license alone is the model's license. |
| `@shiguredo/rnnoise-wasm` | https://github.com/shiguredo/rnnoise-wasm — Apache-2.0 | WASM wrapper. |
| RNNoise | https://github.com/xiph/rnnoise — BSD-3-Clause | Noise suppression model/DSP implementation underneath the wrapper. Preserve copyright/disclaimer and exact bundled model provenance. |
| Fontsource packages | https://fontsource.org/ — per-font licenses | Package/source tooling terms and font terms are distinct. Fonts are dependencies, not copied system-font binaries. |
| DM Sans, JetBrains Mono, Barlow Condensed | Upstream font projects / SIL Open Font License 1.1 | Verify installed OFL notices and reserved-font-name terms. No font modifications or redistribution of environment/system font files occurs in this source archive. |
| Vitest | https://github.com/vitest-dev/vitest — MIT | Test tool. |
| Playwright | https://github.com/microsoft/playwright — Apache-2.0 | Browser test tool; browser binaries have their own terms and are not bundled. |

## UI source provenance

`components/magic/signal.tsx` is original source implementing number interpolation, a monochrome edge signal and reveal behavior, informed by public Magic UI interaction patterns. Magic UI's open-source library is MIT-licensed: https://github.com/magicuidesign/magicui. No upstream copyright header has been stripped from copied files; no literal upstream component file was included.

`components/aceternity/file-upload.tsx` is an original native-picker/drag-and-drop implementation with original pointer-glow behavior. Aceternity's public examples informed interaction direction, not a copied paid component. No Aceternity Pro code, paid template, branding, image or restricted-license asset is used. Consult https://ui.aceternity.com/ and its current applicable terms before replacing these files with third-party source. The directory name identifies inspiration, not a claim of an upstream package dependency.

## Original demo and development tools

The SVG person, room composition and script in the demo are original project material, licensed under this repository's MIT license. Speech is synthesized from that original script by a development-only eSpeak invocation. The demo is not a recording of an identifiable real person. eSpeak and native FFmpeg are generation tools, not linked application dependencies or redistributed executables. Review generated-output terms of any replacement voice engine separately.

The layout screenshots used substitute system fonts in a private test harness. Those font files and the harness are not included in the repository or archive. Production source imports the declared Fontsource dependencies instead.

## Face-detection test fixture

`tests/fixtures/face-astronaut.png` is the astronaut photograph distributed by scikit-image, credited there to NASA with no known copyright restrictions and identified as public domain. It is used only as a deterministic face-detection test input, not as the product demo or an endorsement. See https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut and https://www.nasa.gov/nasa-brand-center/images-and-media/. The test fixture is excluded from the application's normal production entry.

## Before distributing a build

Commit the resolved dependency lockfile. Run asset preparation and inspect `public/runtime/manifest.json` and collected `public/notices/`. Verify the pinned speech-model revision and its converted-artifact provenance, record the face-model checksum, RNNoise model source, AAC/FFmpeg version and source/build availability. Retain applicable copyright, license and NOTICE text in the deployed distribution. Do not mark the license gate complete merely because an npm package has a license field.
