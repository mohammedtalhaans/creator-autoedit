# Reused sources

Current source reuse is documented in:

- [SOURCES_ORIGIN_UI.md](SOURCES_ORIGIN_UI.md) — Origin UI NG anatomy and
  tokens at commit `d785a610f510f5197a145f8c1a24249309bacd2d`, adapted from
  Angular components to React with the installed Radix primitives.
- [SOURCES_CAPTURE.md](SOURCES_CAPTURE.md) — native MediaRecorder and the
  local Dexie recording repository pattern.
- [SOURCES_CAPTIONS.md](SOURCES_CAPTIONS.md) — current deterministic caption,
  audio, and cut implementation boundaries.

Runtime dependencies used by the current non-model build are React/React DOM,
Radix React primitives, Mediabunny, the official Mediabunny AAC encoder,
Mammoth for DOCX text import, Motion, Lucide, and the bundled Fontsource fonts.
Exact versions and notices are in `package-lock.json`,
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), and generated
`public/notices/`.

Earlier research notes about local speech or writing models are historical
context only. Those code paths, packages, workers, runtime assets, and model
domains were removed from this build and are not part of the current feature
claim.
