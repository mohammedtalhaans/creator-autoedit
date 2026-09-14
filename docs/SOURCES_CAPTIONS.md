# Caption and speech-aware cut sources

The caption styles and renderer are source-owned implementation. Preset names
describe appearance and do not claim to reproduce a proprietary template,
CapCut asset, or private font.

Speech-aware VAD adapts the following checked-in research source:

- `C:\Users\Talha\Documents\vibecodingapps\.research\creator-autoedit\promptme-ai\src\vad.worker.js`
- Research source commit: `fe1de139b4266f5aac8edb9406c61a4ecf006d33`
- The source's project license and attribution requirements remain applicable;
  this project keeps the adaptation notice in `src/workers/speech-vad.worker.ts`.

The production worker uses the installed `@huggingface/transformers` 3.7.2
package, same-origin `public/runtime/ort/` WASM, one ONNX Runtime thread, and
the immutable model revision below:

- Model: `onnx-community/silero-vad`
- Revision: `e71cae966052b992a7eca6b17738916ce0eca4ec`
- Model API: `AutoModel` with `config.model_type = custom`, `fp32`, sample-rate
  tensor `16000`, and hidden state shape `[2, 1, 128]`.

The installed model was probed locally before integration. A zero-valued 512
sample frame returned probability `0.044262707233428955` and a finite updated
hidden state. Model load remains lazy and cancellable; energy detection is the
truthful fallback when the model is unavailable.

Portrait effects use the source-owned MediaPipe worker pattern from:

- `https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/image-segmenter.ts`
- Installed package: `@mediapipe/tasks-vision` 1.0.1, Apache-2.0.
- Model URL: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite`
- SHA-256: `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`.

The model was run with `ImageSegmenter`'s CPU delegate on
`tests/fixtures/face-astronaut.png`; the category mask was 256×256 and
contained categories 0, 2, and 3. Category 0 is used for background blur and
categories 2/3 for skin smoothing. The app verifies the checksum before model
construction and reports a structured processing error if verification or
runtime preparation fails.
