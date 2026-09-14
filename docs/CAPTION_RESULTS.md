# Caption and cut implementation results

The editor now uses one caption layout path for the live Canvas preview and the
Mediabunny export. Caption cards support 1–8 words, 1–2 measured lines, the
existing `clean`, `punch`, `editorial`, `subtitle`, and `creator` presets, and
the original source-owned social styles `bold-outline`, `karaoke`, `one-word`,
`minimal`, and `neon`. Font family, weight, size, letter spacing, text/accent
colour, outline, plate, corner radius, line gap, italic, alignment, safe area,
placement, opacity, shadow, and active-word animation are applied through the
same renderer.

Corrected long words are reduced to fit the safe width, and a final measured fit
keeps even unusually long corrections inside the frame. The raw monitor bypasses
caption layers and appearance grading; edited preview and exported pixels share
the selected appearance look and intensity.

Recorded takes may opt into real portrait effects. The edited preview and MP4
worker use MediaPipe `ImageSegmenter` with the CPU delegate and the versioned
`selfie_multiclass_256x256` model. Category 0 masks the background for blur and
categories 2/3 mask body/face skin for low-radius smoothing. A Chromium smoke
on `tests/fixtures/face-astronaut.png` returned a 256×256 category mask with
non-empty background and skin categories; raw camera bytes remain untouched.

Pause editing has one EDL authority (`projectCuts`). Energy detection remains
the immediate offline path. Speech-aware mode lazily runs pinned Silero VAD in a
dedicated single-thread worker over 16 kHz PCM in 512-sample frames, with
hysteresis and pre/post padding. Its complement includes leading/trailing
silence and unions timestamped words before cuts are proposed. Model load or
runtime errors preserve the energy decisions and expose an explicit fallback
state. All-silent clips get a keep decision so export cannot produce an empty
video.

Validation run during implementation:

- `npm test`: 17 files, 147 tests passed.
- Actual Transformers.js 3.7.2 Silero probe: a 512-sample frame returned a
  finite probability (`0.0442627`) and updated `[2, 1, 128]` hidden state.
- The existing browser export/model fixtures remain covered by their current
  Playwright suites; a full production browser smoke still depends on the
  surrounding teleprompter changes landing cleanly.
