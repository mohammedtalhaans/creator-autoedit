# Third-party notices and release obligations

This repository's original application code, artwork and demo text use the MIT license in `LICENSE`. That license does not relicense dependencies, compiled codecs, fonts or other third-party material.

`scripts/prepare-assets.mjs` collects installed license and NOTICE files into `public/notices/` and writes a version manifest. Generated notices do not replace review of binary or source distribution obligations.

The current phone flow ships no speech, writing, vision, noise-suppression, or
other machine-learning package or model runtime. The empty `public/runtime/`
manifest is retained for release diagnostics only.

| Component | Upstream / declared terms | Usage and obligations |
|---|---|---|
| React, React DOM | https://github.com/facebook/react — MIT | Rendering. Preserve installed license. |
| Vite / React plugin | https://github.com/vitejs/vite — MIT | Development/build tools. |
| TypeScript | https://github.com/microsoft/TypeScript — Apache-2.0 | Build/test tool. |
| Tailwind CSS | https://github.com/tailwindlabs/tailwindcss — MIT | CSS integration. |
| Radix primitives | https://github.com/radix-ui/primitives — MIT | Dialogs, sliders, switches, tooltips, Slot. |
| Motion | https://github.com/motiondivision/motion — MIT | Interaction and layout animation. |
| Lucide | https://github.com/lucide-icons/lucide — ISC, with upstream Feather notices | Interface icons. |
| CVA / clsx / tailwind-merge | Their installed package repositories and notices — Apache-2.0 / MIT / MIT respectively | Class composition. |
| Mediabunny | https://github.com/Vanilagy/mediabunny — MPL-2.0 | Demux/decode, samples, codecs and mux. Preserve MPL notices and access to corresponding covered source. |
| `@mediabunny/aac-encoder` | Same upstream — MPL-2.0 wrapper; FFmpeg AAC implementation LGPL-2.1-or-later per upstream extension documentation | Lazy AAC fallback. Review exact shipped binary/source/build and relinking/source-offer requirements before redistribution. |
| Fontsource packages | https://fontsource.org/ — per-font licenses | Font package/source tooling terms and font terms are distinct. |
| DM Sans, JetBrains Mono, Barlow Condensed | Upstream font projects / SIL Open Font License 1.1 | Verify installed OFL notices and reserved-font-name terms. |
| Vitest | https://github.com/vitest-dev/vitest — MIT | Test tool. |
| Playwright | https://github.com/microsoft/playwright — Apache-2.0 | Browser test tool; browser binaries have their own terms and are not bundled. |

## UI source provenance

`src/components/ui/origin.tsx` adapts the public Origin UI NG component anatomy and tokens at commit `d785a610f510f5197a145f8c1a24249309bacd2d`. The upstream project is Angular; this app keeps its React runtime and uses the already installed Radix React primitives. See `docs/SOURCES_ORIGIN_UI.md` for the exact source paths.

`src/components/aceternity/file-upload.tsx` is an original native-picker and drag-and-drop implementation. No paid component code or restricted asset is used.

## Before distributing a build

Commit the resolved dependency lockfile. Run asset preparation and inspect `public/runtime/manifest.json` and `public/notices/`. Retain applicable copyright, license and NOTICE text in the deployed distribution.
