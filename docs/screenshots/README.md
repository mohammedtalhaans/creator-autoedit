# Screenshot provenance — RC2

These 25 PNGs show the actual source UI rendered in Chromium at 1440 px desktop and 390 px phone widths. They are **source-layout reviews**, not captures of a verified production dependency build. Open `index.html` for the gallery.

Missing Motion/Radix/icon/utility packages are replaced in the private harness; local React 18.2 substitutes for the declared React 19.2. System fonts substitute for declared fonts. The actual bundled video, real audio-derived waveform and shared Canvas caption/crop renderer are used. Caption words/timing are explicit fixtures, not Whisper results.

Analysis and export states are seeded only to inspect their interface. The completion-state media is an independently generated development-tool fixture, not application export. Visible watermarks distinguish source-layout and processing-state reviews. These fixtures do not bypass or simulate processing in the shipping application.

No copied runtime, UI adapter, system font or fake application-export file is included in this delivery. Real installed-library, accessibility, animation, ML, encoder and phone validation remains open. See ../../QA_REPORT.md and ../evidence/source-ui-checks.json.
