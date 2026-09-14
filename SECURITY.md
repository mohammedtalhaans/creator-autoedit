# Privacy and security boundary

Creator AutoEdit processes selected videos and native camera recordings in the
browser. Source media, scripts, local edit state, and exported video are kept
in memory or the local IndexedDB recording library. The application has no
account, backend, analytics, session replay, or source-media POST/PUT path.

The Content Security Policy allows same-origin application assets and blocks
forms, object embeds, and cross-origin connections. The production service
worker is scoped to the repository base and handles only its generated shell
assets; it does not cache recording manifests, take chunks, blob URLs, or
cross-origin requests. User-initiated downloads are explicit external actions.

Scripts and recordings can contain sensitive material. Do not publish them in
issues or evidence artifacts. Browser extensions, a compromised static host,
modified dependencies, operating-system capture, storage eviction, and user
sharing are outside the app's direct control.

The app reports recoverable storage failures and provides a recovery download
when captured bytes remain. A browser or operating-system crash can still lose
an unflushed tail, so no absolute zero-loss guarantee is made. Physical device,
thermal, and long-recording behavior remain release checks rather than claims.

See [docs/TELEPROMPTER_VERIFICATION.md](docs/TELEPROMPTER_VERIFICATION.md),
[RELEASE_GATES.json](RELEASE_GATES.json), and [QA_REPORT.md](QA_REPORT.md) for
the current verification boundary. Report vulnerabilities through the actual
repository's private security channel after maintainers enable one; this local
source delivery does not invent a support address.
