# Prompter source reuse and licenses

The matcher and worker design adapt the following upstream sources. Adapted code is rewritten into the local TypeScript feature boundaries and does not import CDN modules or bundled sample prose.

## PromptMe AI

- Repository: `larsbaunwall/promptme-ai`
- Commit: `fe1de139b4266f5aac8edb9406c61a4ecf006d33`
- License notice: MIT, retained in the research checkout at `.research/creator-autoedit/promptme-ai/LICENSE`
- Adapted ideas: Double Metaphone normalization with article overrides, inverted token index, locality-aware candidate scoring, banded word-level Levenshtein, multi-hypothesis progression, latest-partial speech queue, separate VAD and transcription workers, and graceful stale inference handling.
- Local replacements: installed `double-metaphone@2.0.1`, `@huggingface/transformers@3.7.2`, same-origin ONNX runtime paths, a dedicated `creator-autoedit-models-*` cache, one WASM thread, explicit worker preparation, and no cross-origin-isolation reload.

## Teleprompter

- Repository: `kevinkissi/teleprompter`
- Commit: `ec0fc7bfdf713efd9ad497761a892002230f0dab`
- License notice: retain the upstream license in the research checkout at `.research/creator-autoedit/teleprompter` when redistributing adapted portions.
- Adapted ideas: reading-line anchoring, position-preserving scroll layout, WPM timing, punctuation-aware estimates, keyboard/manual transport, and local font loading through `FontFace`.
- Excluded: unrelated bundled prose, peer/remote networking, remote controls, and upstream CDN imports.

## Local models

- Moonshine Tiny ASR: `onnx-community/moonshine-tiny-ONNX`, pinned revision `a6da1241cd305dcd64eab1edbd615f2bb9aabb95`, CPU/WASM q8.
- Silero VAD: `onnx-community/silero-vad`, pinned revision `e71cae966052b992a7eca6b17738916ce0eca4ec`, CPU/WASM fp32.
- Optional writing assist: `onnx-community/SmolLM2-135M-Instruct-ONNX`, pinned revision `b8a5c0f183b78c55955a5364f610c36668b5e681`, CPU/WASM q4.

Model revisions were resolved from the Hugging Face model API on 2026-09-13. A revision change requires a new model probe, cache review, and production verification.
