# Current evidence

Captured 13 September 2026 from the built application on Windows, using Chromium at the repository subpath `/creator-autoedit/`.

| Evidence | What it shows |
|---|---|
| [production-home-desktop.png](production-home-desktop.png) | Actual built landing page at desktop width |
| [production-home-mobile.png](production-home-mobile.png) | Actual built landing page at 390 px |
| [production-editor-with-audio-desktop.png](production-editor-with-audio-desktop.png) | Actual editor after importing the audio fixture |
| [production-editor-with-audio-landscape.png](production-editor-with-audio-landscape.png) | Actual editor at a 768 px landscape viewport |
| [production-editor-with-audio-mobile.png](production-editor-with-audio-mobile.png) | Actual editor at a 390 px touch viewport |
| [production-editor-no-audio-desktop.png](production-editor-no-audio-desktop.png) | Actual editor after importing the no-audio fixture |
| [production-complete-with-audio-desktop.png](production-complete-with-audio-desktop.png) | Actual completion page after the with-audio export |
| [production-with-audio.mp4](production-with-audio.mp4) | Downloaded UI export: H.264/AVC + AAC-LC mono, 720×1280, 4.608 s, 279,344 bytes |
| [production-no-audio.mp4](production-no-audio.mp4) | Downloaded UI export: H.264/AVC only, 720×1280, 2.000 s, 97,676 bytes |
| [production-with-audio-browser-metadata.json](production-with-audio-browser-metadata.json) | Chromium decoded output: 720×1280, 4.608 s, one audio track, 26,850 decoded audio bytes, three sampled frame paints |
| [production-no-audio-browser-metadata.json](production-no-audio-browser-metadata.json) | Chromium decoded output: 720×1280, 2.000 s, zero audio tracks, three sampled frame paints |
| [development-with-audio-export-metadata.json](development-with-audio-export-metadata.json) | Browser fixture inspection: 720×1280 H.264/AAC, 4.608 s, 138 video frames, 216 audio samples, 4/4 non-black decoded samples, and 19 caption-colour pixels |
| [actual-transcription.json](actual-transcription.json) | Actual Chromium Whisper CPU/q8 inference: 12 timed words from the speech fixture; review is still required because one phrase was misheard |
| [actual-audio-measurements.json](actual-audio-measurements.json) | Actual RNNoise Chromium run: denoised signal, 288,000 samples, finite peak 0.823, mean difference 0.0284 |
| [actual-face-detections.json](actual-face-detections.json) | Actual MediaPipe Chromium run: first/last detections 0.627/0.639 confidence, endpoint movement 0.340; middle sample confidence 0 is an explicit missed-detection hold |
| [production-csp-transcription.json](production-csp-transcription.json) | Actual built caption worker under production CSP and `/creator-autoedit/`: phrase text plus 16 model requests |
| [production-csp-face-runtime.json](production-csp-face-runtime.json) | Actual built face worker under production CSP and `/creator-autoedit/`: two same-origin vision runtime requests plus one face-model request |

The browser run also exercised repository-subpath loading, width checks at 360/390/768/1440 px, malformed-file recovery, actual playback samples, and the no-upload assertion. The model fixtures are deterministic test inputs, not a real-person episode recording. These results do not certify iPhone Safari, Android Chrome, physical desktop Safari, or thermal/memory behavior.
