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

No upstream code is copied into `src/features/recording` without adaptation.
Recording chunks and scripts remain local in IndexedDB; no media is put in
`localStorage` or sent to a remote service.

