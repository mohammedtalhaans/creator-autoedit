# Privacy and security boundary

Source videos are File/Blob objects retained in the current tab only. Audio analysis, transcripts, edit state and output Blobs are not sent to a backend. No application database, account, source-media cache or telemetry endpoint exists.

Models and runtime assets are downloaded. Static hosts receive ordinary web requests. Browser extensions, a compromised host, a modified dependency, OS-level recording and user-initiated sharing are outside the app's direct control. Review dependency and model updates accordingly.

The document includes a Content Security Policy. MediaPipe executes in a worker with a narrow fetch/XHR asset allowlist and disabled exposed telemetry transports. This is defense in depth, not proof that every possible third-party runtime mechanism is contained. Capture real worker network activity before release, especially when upgrading MediaPipe. Do not broaden the allowlist to “fix” unexplained requests without reviewing them.

To report a vulnerability, use the actual repository's private security reporting channel after a maintainer enables it. Do not publish private clips, tokens or personal transcripts in an issue. There is no fabricated support address in this source delivery.

A release requires verified model/runtime licensing, exact artifact provenance, install/build/browser tests, and a network audit showing no media or transcript exfiltration. See `RELEASE_GATES.json` and `QA_REPORT.md`.
