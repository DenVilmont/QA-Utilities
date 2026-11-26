# Third-party libraries

Bundled into single files with esbuild, so the extension loads them locally (no network).

| File | Library | Version | License | Changes |
|---|---|---|---|---|
| `mediabunny.js` | [Mediabunny](https://github.com/Vanilagy/mediabunny) | 1.66.4 | MPL-2.0 (`mediabunny-LICENSE`) | None. Only `Input`, `BlobSource`, `WEBM`, `CanvasSink`, `Output`, `BufferTarget`, `WebMOutputFormat`, `Conversion` are included. |
| `gifenc.js` | [gifenc](https://github.com/mattdesl/gifenc) | 1.0.3 | MIT (`gifenc-LICENSE.md`) | `writeFrame` accepts `x` and `y`: the position of the frame on the GIF screen (the original always writes 0, 0). |

Used by `scripts/video-tools.js` and `scripts/gif-worker.js` (screen recordings: fixing the WebM file, cutting it, turning it into a GIF).
