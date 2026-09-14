# Opt-in local prompt model evidence

The model probe is deliberately separate from ordinary end-to-end checks because
the first run downloads local ONNX weights and can take several minutes on a
CPU-only browser. Run it with `ENABLE_PROMPT_MODEL_E2E=1 npx playwright test
--config playwright.prompt-model.config.ts` (PowerShell: `$env:ENABLE_PROMPT_MODEL_E2E='1';
npx playwright test --config playwright.prompt-model.config.ts`). The dedicated
development server uses port `4310`; it does not stop or reuse other project
servers.

The voice case fetches `tests/fixtures/tiny.mp4`, decodes its audio with Web
Audio, routes an `AudioBufferSourceNode` into
`AudioContext.createMediaStreamDestination()`, and passes that stream to the
actual `LocalVoiceController.start()` implementation. It records returned
transcripts, matcher cursor movement, pause/resume, stop/restart, and a stale
session callback after a manual jump. It never opens a real microphone and does
not route fixture audio to speakers.

The writing case uses the actual `prompt-ai.worker.ts` and the pinned
`onnx-community/SmolLM2-135M-Instruct-ONNX` revision. It prepares the worker,
generates a short draft, rewrites it, then cancels an in-flight generation. The
probe checks that the returned text is nonempty and distinct and reports
`applied: false`, leaving source text unchanged.

Successful runs write the measured result and model revision to
`docs/teleprompter-evidence/model-voice.json` and
`docs/teleprompter-evidence/model-writing.json`. Failures include the exact
production source path and browser error message in the Playwright failure.
The evidence remains browser/runtime specific and does not establish support
for physical iOS or Android microphones.

## Current run

On 13 September 2026, the HMR-disabled Chromium probe on port 4310 passed the
voice case in 58,763 ms after the VAD worker was corrected to feed exact 512
sample frames. Moonshine returned the real phrase “Your best ideas be learned
to be heard.”; the matcher advanced the script cursor from 0 to 6. The run
also observed paused and listening states, a fresh stop/restart session, and
one stale callback ignored after a manual cursor jump to 4.

The same probe passed the SmolLM case in 74,653 ms. It returned a nonempty
multiword draft and a distinct rewrite, then rejected an in-flight generation
after cancellation with `applied: false`. The earlier voice attempt is retained
in the evidence history as a production Silero shape failure (`2048` input
versus the model's `512` frame contract); no canned transcript was substituted.
