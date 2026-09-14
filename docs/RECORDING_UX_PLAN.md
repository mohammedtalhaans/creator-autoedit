# Recording view correction

## Camera

The default camera treatment is **Full view**. It preserves the source field of view and accepts black letterboxing when the camera and requested canvas have different aspect ratios. **Fill screen** remains an explicit option.

For Auto rotation, compare the decoded stream dimensions with the requested orientation. If their orientations differ, rotate the source by one quarter turn before scaling. Do not use the handset screen angle as the primary camera-frame rotation: browsers may already normalize camera frames. Manual 0°, 90° and 270° overrides remain available for devices that report incorrect metadata.

The preview and recorded canvas use the same fit/fill and rotation settings. A 16:9 source mapped to a 9:16 output must retain the whole source in Full view. The recorder keeps the original microphone track.

## Recording navigation

The full-screen Record and Review stages hide the large four-step stepper. Their top bars show Back, stage title and a compact `2 of 4` or `3 of 4` badge. Script and Edit may retain the full stepper where it helps orientation.

The recording bar keeps the timer, mic meter, circular shutter, prompt play/pause, `Aa` prompt controls, camera settings and camera flip. Camera settings are locked during capture. Prompt controls stay editable while capture is active.

## Prompt controls

The default overlay is smaller and lighter: 38px text, 1.25 line height, 86% column width, 34% viewport-height window and 38% black background opacity. The focus line remains near the lens.

The live Origin bottom sheet exposes:

- WPM or timed duration
- text size and font
- reading-line height and prompt-window height
- column width and horizontal position
- line height and letter spacing
- text alignment
- text and background colour plus background opacity
- bold, mirror, dim surrounding text and focus-line visibility

Quick presets provide Lens, Minimal and Large-text starting points. Every change updates the overlay immediately, persists with the script, and does not pause or restart MediaRecorder.
