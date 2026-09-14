# Creator AutoEdit — episode pack

**Episode premise:** Can a small browser editor get a talking video through its first edit without turning into a full editing suite?

> **Recording status — browser proof available:** the current source tree passed its 145-file delivery-manifest integrity check. A fresh Windows Chromium run also produced and played real H.264 MP4 exports with and without audio, and the actual model smoke paths passed under development and production CSP; see [current evidence](../current-evidence/README.md). Whisper output still needs a human transcript review, and physical Safari/Android checks remain unverified. Complete the rehearsal in [recording.md](recording.md) with your own rights-cleared talking-head take before recording.

**Audience:** creators curious about the tool and viewers following your app-building series. **Delivery:** conversational screen demo with a brief face-camera introduction and close. **Primary cut:** approximately 3–4 minutes. **Short cut:** approximately 45–60 seconds.

The series name, episode number, channel, and public URL were not supplied. The scripts work without a series-specific introduction. Replace `[LIVE_URL]`, `[REPOSITORY_URL]`, and optional `[NEXT_EPISODE]` before posting. Do not publish placeholder links.

## Record in this order

1. Follow [recording.md](recording.md) to capture one real source clip and its exported result.
2. Record the screen demonstration; use the actual interface and result from this build.
3. Record [script.md](script.md), then cut in the screen footage. Its short version uses the same assets.
4. Pick a title and paste the relevant copy from [publishing.md](publishing.md).

## Product story

Creator AutoEdit is a focused editor for a single talking video. The useful outcome is straightforward: trim dead air, review the words, choose the frame, and save a video. Show the decisions the creator can still control, especially restoring a pause and correcting a caption. The proof is the downloaded video playing outside the editor.

Keep this episode centered on one take and one finished result. A tour of every slider will dilute it. Use your own clip for the main before/after; the bundled illustrated demo can establish the interface, but should stay labeled as a demo.

## Keep the episode accurate

The core script assumes pause detection/restoration, caption editing, reframing, export, and playback of the downloaded file. The current browser evidence proves export, playback, and model execution on the fixture; use a real talking-head clip and review the transcript before describing captions as ready. If the model is unavailable during recording, enter a short transcript yourself and say “I added the captions.” See [current verification](../CURRENT_VERIFICATION.md) for deployment and test scope.

- Do not call pause detection filler-word removal. It does not establish which spoken words are expendable.
- Do not claim caption generation if you pasted a transcript. Say “I added the captions” and show that step.
- Do not claim voice cleanup or automatic face tracking unless the final build actually performs them and the captured result demonstrates it. They are intentionally outside the core script.
- Use measured results from your actual recording; do not claim instant export, universal browser support, or a live site without checking it.
- When describing local processing, distinguish a model/code download from a media upload. Use the actual privacy behavior of the final build.

No footage, voiceover, music, or final episode video has been created by this pack. Recording and the final editorial cut remain the creator's work.
