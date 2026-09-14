# Contributing

Export correctness, synchronization, local privacy and reliability come before decorative work. Keep the product focused on one speaking video.

Use Node 22.12+, install dependencies, review the lockfile, then run lint/typecheck/Vitest/build/Playwright. Do not update dependency versions without rerunning runtime/model/codec tests. `npm run format` uses Prettier.

Keep source timestamps canonical. Route all new time-based behavior through `EditMap`. Add tests for seam boundaries and adjacent cuts; never create an independent caption or audio offset table. Close decoded resources immediately and cancel stale worker jobs when projects change.

New controls must change preview and final export consistently. Do not add decorative toggles, fabricated progress, generated “sample” transcripts on failure, dummy exports, cloud-processing fallbacks, analytics or source-media persistence. Use honest fallback copy.

UI changes need narrow-phone and wide-workspace review, keyboard/VoiceOver testing, reduced motion and actual installed-library checks. Screenshots from the isolated presentation harness do not replace this.

For a bug, include browser/OS, hardware class, source container/codec/duration/resolution, selected edit settings, observed versus expected behavior and a rights-cleared minimal fixture. Never attach a creator's private footage without explicit permission.

Every release must include a completed `QA_REPORT.md`-style evidence package and reviewed `RELEASE_GATES.json`. Do not mark gates passed to make CI green. Skipped encoder tests and untested phone workflows must remain visible.
