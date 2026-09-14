# Creator AutoEdit

Creator AutoEdit is a local browser studio for one talking video. The primary
path is **Script → Record → Review → Edit → Export**. A camera and microphone
are requested only after Continue; the first Script surface is read-only and
does not ask for media permission.

## Run it

Use Node 22.12 or later:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/creator-autoedit/`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:production
```

The production build registers a repository-scoped offline shell. It caches
only built app assets; recording manifests and media chunks remain in
IndexedDB. No model download or AI runtime is part of this build.

## Current verification

Read [docs/TELEPROMPTER_VERIFICATION.md](docs/TELEPROMPTER_VERIFICATION.md) for
the current phone-flow checks, [docs/TELEPROMPTER_FEATURES.md](docs/TELEPROMPTER_FEATURES.md)
for feature boundaries, and [docs/phone-flow-evidence](docs/phone-flow-evidence/)
for settled screenshots.

The Origin UI NG React adaptation is documented in
[docs/SOURCES_ORIGIN_UI.md](docs/SOURCES_ORIGIN_UI.md). The source is Angular,
so its anatomy and tokens are adapted to the installed React/Radix runtime.

## Privacy and limits

Source video and recordings stay in the browser and local IndexedDB. There is
no account, backend, analytics, session replay, or source-media upload path.
User-initiated downloads leave the browser by design. Browser storage can be
evicted and a crash can lose an unflushed tail; the app does not promise
absolute crash recovery.

The current browser evidence is controlled Chromium only. Physical iPhone,
Android, and macOS camera behavior, long recordings, thermal behavior, and
browser-specific hardware controls remain untested. Teeth enhancement and a
browser thermal sensor are unsupported. See [SECURITY.md](SECURITY.md) and
[QA_REPORT.md](QA_REPORT.md) before calling a build certified.
