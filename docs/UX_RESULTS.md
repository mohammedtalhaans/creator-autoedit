# Signal Studio UI polish

## Design plan

Preserve the existing graphite, signal green, cyan guide, Barlow Condensed, DM Sans, and mono system. Keep the waveform/video monitor as the product’s signature. The pass focuses on making the editing sequence legible at the edges of the viewport: clear active and disabled states, a focused preview that can be adjusted without a pointer, and mobile controls that remain reachable above the home indicator.

The compact flow remains:

```text
[source video] → [analysis tasks] → [monitor + timeline] → [module sheet] → [export/save]
```

## Changes

- The preview canvas is keyboard focusable in edited mode. Arrow keys move the frame or caption position; Shift+Arrow makes a larger adjustment. The accessible name explains the interaction.
- `TaskRow` exposes live task changes and determinate progress to assistive technology while keeping the visible task copy grounded in the store’s actual detail.
- Disabled switches and segmented controls expose the reason they are unavailable, including no audio and Voice Enhance prerequisites. Slider output is exposed as value text.
- The editor source name has a full `title` and accessible label while retaining ellipsis in constrained headers. The export action explains why it is disabled while edits are preparing. The momentary original comparison exposes its pressed state and the transport’s voice mode is announced.
- Caption phrase focus now has a visible editing state; its textarea names the save/cancel keyboard behavior and the preview seek action is called “Preview caption”.
- Mobile sheets, toasts, and the fixed module rail include safe-area padding. Landscape mobile uses the available viewport height for the monitor and gives the sheet more vertical room. Horizontal overflow is clipped at the app shell.

## Evidence

- `npm run typecheck` passes after the changes.
- Focused lint for the owned `Editor.tsx` and `Preview.tsx` passes after replacing the standalone seek expressions and isolating preview keyboard events. Full `npm run lint` still reports the unrelated `face-track/index.ts` warning; the required source snapshots under `docs/polish-originals` retain their untouched pre-pass `Editor.tsx` warning until excluded by the root lint config.
- Browser capture/viewport QA remains with the root and QA agents; the target viewports are 360, 390, 768, 1440, and landscape mobile.
- The same-origin MediaPipe loader bridge was exercised in a direct Chromium test page. It now initializes and returns genuine detections at x≈0.288 (confidence ≈0.627) and x≈0.628 (confidence ≈0.639); the centered fixture sample returned the worker’s explicit no-detection fallback (confidence 0), so the existing all-three-confidence model assertion remains unresolved.
- After `node scripts/prepare-assets.mjs`, all three copied vision JavaScript loaders have manifest hashes matching their transformed bytes. The internal and no-SIMD loaders expose `globalThis.ModuleFactory` and `globalThis.custom_dbg`; the module loader already contained both registrations.
