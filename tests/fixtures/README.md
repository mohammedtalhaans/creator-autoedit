# Media fixtures

`tiny.mp4`: six-second H.264/AAC excerpt of the original illustrated/synthetic demo.

`no-audio.mp4`: two-second H.264-only excerpt.

`demo-manifest.json`: actual generated phrase intervals and asset metadata. These intervals are fixture data, not claimed Whisper inference.

`demo-ffprobe.json`: native ffprobe output for the actual bundled demo. This verifies the development fixture, not Creator AutoEdit's browser export pipeline.

Regenerate with `python scripts/generate-fixtures.py` after installing its explicitly declared Python/native development requirements. The application itself does not invoke Python, eSpeak or native FFmpeg.

Original artwork/text are under the repository MIT license. The files are not phone-shot media and do not replace physical-device acceptance.


## Face-detector integration fixture

`face-astronaut.png` is the NASA photograph distributed as `skimage.data.astronaut` (Eileen Collins), which scikit-image identifies as public domain with no known copyright restrictions. It is used **only in automated detector tests**, not as the product demo, an endorsement, or synthetic talking footage.

Source and license statement: https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut
NASA media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
