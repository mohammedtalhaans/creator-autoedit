# Capture sources and attribution

The recording library adapts the IndexedDB repository pattern from
[`kevinkissi/teleprompter`](https://github.com/kevinkissi/teleprompter), commit
`ec0fc7bfdf713efd9ad497761a892002230f0dab` (the local research checkout is
`.research/creator-autoedit/teleprompter`). The adapted pattern is the Dexie
database/repository separation and newest-first script listing. Creator AutoEdit
uses a separate database schema and its own recording manifest/chunk transaction
logic. The upstream project is MIT licensed; the upstream repository's license
notice applies to that adapted pattern and is retained here for attribution.

Native camera and microphone capture follows the browser MediaRecorder and
MediaDevices standards. Media assembly uses the existing project dependency
[`Mediabunny`](https://github.com/Vanilagy/mediabunny) and the already pinned
AAC encoder where the browser does not expose AAC encoding.

The no-pre-crop request follows the W3C definition of `resizeMode: none`; the
specification defines `crop-and-scale` as permission for the user agent to crop
or downscale camera frames. WebKit's public bug tracker documents historical
iPhone portrait recording and preview-axis failures in
[bug 198912](https://bugs.webkit.org/show_bug.cgi?id=198912),
[bug 220326](https://bugs.webkit.org/show_bug.cgi?id=220326), and
[bug 290223](https://bugs.webkit.org/show_bug.cgi?id=290223).

The screen-powered front flash follows Snap's documented Ring Light behavior:
a soft illuminated preview border with adjustable gradient intensity and color
temperature. The visual reference and behavior are documented in Snap's
[Inclusive Camera guide](https://developers.snap.com/camera-kit/integrate-sdk/ios/guides/inclusive-camera)
and its official `cam-kit-ring-flash.jpg` example. No Camera Kit code or SDK is
included; the web implementation is original CSS and existing UI primitives.

No upstream code is copied into `src/features/recording` without adaptation.
Recording chunks and scripts remain local in IndexedDB; no media is put in
`localStorage` or sent to a remote service.

Portrait camera orientation detection adapts the 16-pixel drawn-frame probe
from [`lagudafuadtosin/web-teleprompter`](https://github.com/lagudafuadtosin/web-teleprompter/blob/0ede41c6e6619921fe2f623e0f67a3658d40dd1b/src/lib/camera.ts),
commit `0ede41c6e6619921fe2f623e0f67a3658d40dd1b`. The probe distinguishes the
upright picture mobile Safari paints from the landscape sensor dimensions it
may report, so the full portrait picture can be recorded without a centre
crop. The upstream code is MIT licensed by Fuad Laguda.
