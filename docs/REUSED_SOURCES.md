# Reused sources and pinned models

The adapted source files and license boundaries are recorded in the existing
focused notices:

- [SOURCES_PROMPTER.md](SOURCES_PROMPTER.md) — `larsbaunwall/promptme-ai`
  `fe1de139b4266f5aac8edb9406c61a4ecf006d33` for matching/worker ideas and
  `kevinkissi/teleprompter`
  `ec0fc7bfdf713efd9ad497761a892002230f0dab` for reading-line/timing ideas.
- [SOURCES_CAPTURE.md](SOURCES_CAPTURE.md) — native MediaRecorder and the
  adapted local Dexie recording repository pattern.
- [SOURCES_CAPTIONS.md](SOURCES_CAPTIONS.md) — Silero VAD and MediaPipe source
  patterns, package versions, model checksums, and runtime constraints.

Pinned local model revisions used by the completed probes are:

- `onnx-community/moonshine-tiny-ONNX`
  `a6da1241cd305dcd64eab1edbd615f2bb9aabb95`
- `onnx-community/silero-vad`
  `e71cae966052b992a7eca6b17738916ce0eca4ec`
- `onnx-community/SmolLM2-135M-Instruct-ONNX`
  `b8a5c0f183b78c55955a5364f610c36668b5e681`

The installed runtime versions are `@huggingface/transformers` 3.7.2,
`@mediapipe/tasks-vision` 1.0.1, and `mammoth` 1.12.3. The exact package
notices and model caveats remain in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
and [PROMPT_MODEL_EVIDENCE.md](PROMPT_MODEL_EVIDENCE.md).
