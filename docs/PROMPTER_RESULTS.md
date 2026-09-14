# Prompter implementation results

The recording studio now opens from Home through `Record with teleprompter` and keeps the workflow in three visible steps: Script, Record, and Takes. Scripts and takes use the durable recording library in `src/features/recording`; the teleprompter UI does not maintain a second media store or a competing recorder.

The reader supports fixed, timed, manual, and optional local voice-follow modes. Prompt parsing keeps director cues, speaker labels, chapter markers, and emphasis visible while excluding cues from word count and duration. Fixed and timed reading can be played without camera, microphone, or model permission. Selecting any word resets matcher history and persists the cursor. Layout changes retain the selected reading position and expose a configurable near-lens reading line, typography, margins, color, mirror, contrast, punctuation pauses, and density timing.

Voice-follow is explicit. `Prepare voice-follow` warms the pinned Moonshine Tiny and Silero workers without requesting a microphone. Starting voice-follow borrows the recorder's already-open microphone track on the Record step, or asks for an audio-only track after the user explicitly starts it in Read Only. Voice workers use a bounded latest-partial queue, two-final catch-up queue, stale session epochs, separate AudioWorklet PCM frames, and Double Metaphone plus banded Levenshtein matching. Failed or uncertain speech holds the cursor.

The Record step keeps native MediaRecorder bytes separate from the display layer. Camera and microphone settings show negotiated values, supported look choices, optional persistent storage, recovery downloads, and local portrait preview effects. Portrait processing is canvas-only and never replaces the saved native source. Higher resolution/frame-rate originals remain downloadable; AutoEdit limits are shown before ingest.

The Takes step keeps previous recordings, supports favourites, comparison selection, original/recovered downloads, section retakes, and AutoEdit handoff with a flat recording metadata snapshot. AI writing is optional and local: a topic draft or rewrite is previewed before Apply/Discard, with cancellation and timeout handling.

Validation completed in this workspace:

- `npm run typecheck`
- `npx vitest run src/features/teleprompter/matcher.test.ts`
- `npx eslint` on the teleprompter components, features, and prompt workers
- Chromium Read Only UI smoke: no permission prompt on initial studio open; practice script and cursor controls visible
- Opt-in Chromium model probe: real Moonshine/Silero voice-follow advanced the matcher, pause/resume/restart and stale callback checks passed; real SmolLM generation, rewrite, and cancellation passed. Evidence is in `docs/teleprompter-evidence/model-voice.json` and `model-writing.json`.
- Controlled Chromium UI capture smoke: the native engine produced a playable take, persisted it to the local take library, and showed the original download action; record start auto-started the prompt and prompt pause left capture active.

The durable native recording engine's controlled camera/microphone and recovery tests are maintained with the recording feature and should be rerun together with model and production CSP probes before release. Real physical iOS/Android camera behavior remains a separate verification item.
