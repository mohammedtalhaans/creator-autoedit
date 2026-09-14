# Phone-first recording flow

## Product path

The primary experience is sequential: **Script → Record → Review → Edit → Export**. The application opens in the script step. Importing an existing video remains a secondary action.

On phones, the recording step occupies the full viewport. The camera is the background, the prompt is a restrained lens-adjacent overlay, and capture controls sit above the bottom safe area. Settings do not extend the recording screen into a long page. A back control is always visible unless the browser is finalizing a recording.

Stopping a recording opens that take immediately in a review screen. The primary decisions are **Retake** and **Keep & continue**. The takes library remains available as history, not as a mandatory navigation step.

## Visual system

- Origin UI NG is the exclusive component reference. Its Angular components cannot run in this React application, so their anatomy, variants, focus states, sizing and dark tokens are adapted into one local React Origin primitive layer. Custom UI is limited to camera/video, waveform/timeline and the capture shutter.
- Black `#000000`, near-black `#111111`, white `#FAFAFA`, muted gray `#A1A1AA`, border `#2A2A2A`. Recording red `#FF3B30` is the only functional color outside user-created video/caption content.
- Keep DM Sans for controls and JetBrains Mono for timer/data. Remove ornamental type and green/cyan visual branding.
- Signature: a full-bleed camera monitor with a narrow focus band near the lens and one large circular record control.
- Motion is limited to step transitions, record-state feedback, and review appearance. Reduced motion removes those transitions.

Origin-derived controls cover buttons, icon buttons, fields, textareas, native selects, sliders, switches, tabs, stepper, badges, cards, alerts, dialogs, bottom sheets and file upload. Their source is `radix-ng/origin-ui` commit `d785a610f510f5197a145f8c1a24249309bacd2d`.

## Behavior decisions

- The default route is the script step. Continue opens the camera step; browsers still require the user gesture before permissions.
- Portrait capture requests portrait dimensions and verifies negotiated track dimensions. The preview and editor use recorded display dimensions/rotation metadata; they do not force a landscape canvas.
- Camera output is recorded from the native stream. Prompt animation cannot stop capture.
- All local AI/ML paths and their controls are removed: writing model, voice-follow, Whisper captions, Silero speech detection, MediaPipe face/portrait processing, and RNNoise enhancement.
- AutoCut uses a deterministic audio gate. Boundaries retain a conservative handle before the next speech onset and a smaller handle after previous speech, preventing clipped opening consonants. Users can adjust each cut with large phone controls and restore it.
- Every non-recording step has a bottom Back/Continue bar. Recording uses Back, flip camera, timer, record/stop, and prompt pause. Review uses Back, Retake, and Keep & continue.
