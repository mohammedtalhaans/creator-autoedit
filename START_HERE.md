# Creator AutoEdit

Creator AutoEdit is a focused, client-side editor for one talking video. It trims detected pauses, lets you review or correct captions, adjusts a vertical crop, optionally enhances the voice, and exports an H.264/AAC MP4 in the browser. Source media and exported media stay on the device; model and runtime assets are downloaded when those features are requested.

## Run it

Use Node 22.12 or later:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/creator-autoedit/`. For the normal checks:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm run test:production
```

The model suite is intentionally separate because it downloads and executes Whisper, RNNoise, and MediaPipe:

```sh
npm run test:models
npx playwright test --config playwright.models.production.config.ts --project=chromium
```

`npm run verify:release` is the full certification guard. It must fail until the explicit model, device, network/privacy, license, and real talking-head evidence is recorded in [RELEASE_GATES.json](RELEASE_GATES.json).

## Pages deployment

1. Push the reviewed source and `package-lock.json` to the repository's `main` branch (the workflow trigger).
2. In repository settings, set Pages > Build and deployment > Source to **GitHub Actions**.
3. The workflow in [.github/workflows/pages.yml](.github/workflows/pages.yml) derives `/repository-name/` for project pages and `/` for `*.github.io`, builds with that base, runs the browser checks, and deploys only after the mandatory Chromium production checks pass.
4. Verify the generated Pages URL and exact repository subpath before sharing it. The local run has no live URL.

This is a browser-verified preview gate. Full release certification remains pending until `verify:release` has real evidence; do not call a Pages preview production-certified from the automated browser run alone.

## Evidence and episode pack

- [Current verification](docs/CURRENT_VERIFICATION.md) — fresh manifest, dependency, browser, and export results.
- [Current screenshots and MP4 outputs](docs/current-evidence/README.md) — small, inspectable artifacts from the built UI.
- [Historical QA report](QA_REPORT.md) — prior source-review findings and the full physical-device acceptance protocol.
- [Episode pack](docs/episode/README.md) — recording plan, main and short scripts, shot list, thumbnail brief, titles, and posting copy.
- [Release gates](RELEASE_GATES.json) — intentionally unverified until each claim has dated evidence.

## Verification matrix

| Environment | Current result |
|---|---|
| Windows host · Chromium | Development fixture/export checks and built-site import/export checks passed, including real H.264 exports with and without audio. |
| Windows host · WebKit | Subpath smoke passed; codec-dependent export checks were skipped when the capability probe could not encode. This is not desktop Safari acceptance. |
| Physical macOS Safari | Not verified. |
| Physical iPhone Safari | Not verified. |
| Physical Android Chrome | Not verified. |
| Memory, thermal, long clips, HDR, VFR phone footage | Not verified. |
| Whisper, RNNoise, MediaPipe model runtime | Chromium dev and built-CSP smoke paths passed; output still needs transcript review and does not certify physical devices. |
