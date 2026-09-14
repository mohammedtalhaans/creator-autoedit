# Recording and edit plan

Use a current build after the documented checks pass. The Windows evidence pack at [docs/current-evidence](../current-evidence/README.md) proves the repository-subpath load and real H.264 export path with and without audio, but it is a fixture run, not your episode footage. The checked build has not been certified on a physical iPhone, Android phone, or desktop Safari.

## Capture kit

- The final verified app build, already open in a supported browser.
- One original talking-head source clip, approximately 25–40 seconds, recorded in landscape with room around your head and shoulders. Use ordinary SDR video for this demonstration.
- Headphones and a microphone that records your narration clearly.
- Screen recording with the browser at a readable size, notifications hidden, and source/edited audio captured cleanly.
- A folder containing the raw source, the actual exported file, the screen capture, and narration. Keep originals intact.

Record the main episode horizontally. Frame your face near the center so that a vertical crop of the intro and close still works. Capture the editor separately from the narration where possible; this makes it easier to hear the before/after without a second voice talking over it.

## Original sample clip to record

This is demo footage inside the episode, separate from the episode narration. Read naturally and preserve the marked gaps. A visible clap before the first line can help you check audio timing; exclude it from the featured before/after if distracting.

> I’ve got an idea for a video, and this is my first take.
>
> [Pause for roughly two seconds.]
>
> Usually, the next job is going back through it and finding the bits where nothing is happening.
>
> [Pause for roughly three seconds.]
>
> But I still want it to sound like me. Some pauses belong in the story.
>
> [Leave a shorter pause.]
>
> So let’s make the first edit, check the captions, and see how the finished clip feels.

Include a small, natural lean halfway through to make the crop check useful. Do not add artificial noise to manufacture an impressive audio-cleanup result. If you demonstrate captions, use their real generation/import path and show which one you used.

## Shot list

| ID | Capture | Needed in edit |
|---|---|---|
| A | Raw source sentence with the long pause | 3–5 seconds; cold open and comparison |
| B | Same sentence from the downloaded export | 3–5 seconds; comparison matches A |
| C | Face-camera introduction | One clean take plus one spare |
| D | Home screen and selecting the source | Keep file-picker details private |
| E | Pause controls; play raw and edited | Let the viewer hear the difference |
| F | Restore a pause and replay it | Demonstrates creator control |
| G | Caption workflow, text correction, one style | Record a full phrase playing |
| H | Vertical framing and a manual adjustment | Replay the source's slight movement |
| I | Start export and actual completion | Label any removed waiting time |
| J | Download and play the file in another player | Mandatory proof shot |
| K | Face-camera close and feedback question | Leave a beat before and after speaking |
| L | Clean final editor screenshot | Thumbnail/background asset |

## Fast rehearsal

Run this once before recording. The episode must use the behavior that actually passes.

- [ ] Start from a fresh page and import the exact source clip you will show.
- [ ] Play it and confirm the waveform/pause controls correspond to the recording.
- [ ] Remove one pause, restore one, and listen for clipped words or harsh transitions.
- [ ] If the local model run passes, review generated captions, change a phrase, and replay it. If it is unavailable, enter a short transcript yourself and say that you added the captions; do not narrate it as automatic transcription.
- [ ] Check the vertical crop at the start, middle, and end.
- [ ] Export and save the actual output. Confirm its file type, dimensions, duration, audio track, and captions match what the UI promises. Keep the exported file from this same take for the proof shot.
- [ ] Open the saved file outside the app; listen for clicks and check lip sync and caption timing.
- [ ] If publishing a live link, repeat a short import/export on that exact GitHub Pages URL and reload it once to catch missing assets or a wrong repository base path.
- [ ] Read the final verification report and omit claims outside its tested scope.

Write down the actual source duration and exported duration only if you want to show them. Do not estimate a performance claim from how fast the screen recording has been edited.

## Editing notes

Open with the comparison, then explain the app. Keep one clear action on screen at a time. Zoom into a control only enough to make it readable, and return to the whole editor so viewers keep their bearings. Leave the cursor still when it is not doing something.

Use simple cuts. The before/after comparison should use the same sentence, with matched playback volume. Let the demonstration audio play by itself for a few seconds. If you use music, use a track you have permission to use and lower or mute it during those comparisons.

Add readable subtitles to the episode itself; these are separate from captions burned into the app's exported demo. Check names, UI labels, line breaks, and timing manually. Keep titles short and out of the way of important controls. For the vertical cut, use detail crops of E, G, H, and J instead of displaying an unreadably small desktop page.

Only use “sped up” when the footage is accelerated; use “time jump” for omitted waiting. Do not intercut a separately rendered result as though it came from this app.

## Final delivery checklist

- [ ] Main episode and short both have clear narration, visible UI, and an audible result.
- [ ] The final export shown is the same one produced in the demonstration.
- [ ] No placeholder links, private file paths, account information, or notifications appear.
- [ ] Any demo footage remains identified accurately.
- [ ] Title and thumbnail describe the feature set shown in the episode.
- [ ] Description uses the published build's actual status and working link.
- [ ] Captions are reviewed and the full episode plays cleanly from beginning to end.

Suggested filenames: `creator-autoedit-episode.mp4`, `creator-autoedit-short.mp4`, `creator-autoedit-thumbnail.jpg`, and `creator-autoedit-captions.srt`. Choose the export settings supported by your recording/editing tools and review the final files before uploading.

