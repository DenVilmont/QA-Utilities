// Background worker of the recording tab: turns a screen recording (WebM) into a GIF, or cuts the video.
// Runs in a worker so the page stays responsive; the page can stop it at any time (Cancel).
//
// Messages from the page:
//   {type: 'gif', blob, start, end, fps}  -> {type: 'progress', value} ..., then {type: 'done', blob}
//   {type: 'video', blob, start, end}     -> the same
// On an error: {type: 'error', message}.
//
// How the GIF stays small (the same ideas as ScreenToGif's default settings):
// - Every frame is compared with what is already on the GIF screen. Only the rectangle around the changed
//   pixels is written; unchanged pixels inside it are transparent, so the previous frame shows through.
// - A frame without changes is not written at all: the previous frame just stays longer on the screen.
// - Every written frame has its own palette of up to 255 colours (+1 for transparency).

import {CanvasSink} from './vendor/mediabunny.js';
import {GIFEncoder, applyPalette, quantize} from './vendor/gifenc.js';
import {cutWebm, openWebm} from './video-tools.js';

// A pixel counts as changed when a colour channel differs by more than this.
// Video compression slightly shifts the colours of pixels that did not change on the screen.
// Tested on a real 1080p recording: 12 left visible speckles on grey areas, 8 is clean and ~20 % bigger.
const CHANGE_THRESHOLD = 8;
const MAX_COLORS = 255;
// Browsers play frames shorter than 2/100 s as 1/10 s, so a frame never gets less.
const MIN_DELAY_CS = 2;
// GIF "do not dispose": the next frame is drawn over this one.
const DISPOSE_KEEP = 1;

function reportProgress(value) {
  postMessage({type: 'progress', value: Math.max(0, Math.min(1, value))});
}

function toCentiseconds(seconds) {
  return Math.round(seconds * 100);
}

function* getFrameTimes(start, end, fps) {
  const step = 1 / fps;

  for (let time = start; time < end; time += step) {
    yield time;
  }
}

// Bounding box of the pixels that differ from what is on the GIF screen, or null if nothing changed.
function findChanges(pixels, screen, width, height, changed) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      const isChanged = Math.abs(pixels[offset] - screen[offset]) > CHANGE_THRESHOLD
        || Math.abs(pixels[offset + 1] - screen[offset + 1]) > CHANGE_THRESHOLD
        || Math.abs(pixels[offset + 2] - screen[offset + 2]) > CHANGE_THRESHOLD;

      changed[pixelIndex] = isChanged ? 1 : 0;

      if (isChanged) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return right < 0 ? null : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

// Frame with only the changed rectangle: changed pixels get their colour (and are copied to the screen),
// the others become the transparent colour.
function createPartialFrame(pixels, screen, changed, width, box) {
  const boxPixels = new Uint8Array(box.width * box.height * 4);
  const changedColors = new Uint8Array(box.width * box.height * 4);
  let changedLength = 0;

  for (let row = 0; row < box.height; row += 1) {
    for (let column = 0; column < box.width; column += 1) {
      const pixelIndex = (box.y + row) * width + box.x + column;

      if (!changed[pixelIndex]) {
        continue;
      }

      const offset = pixelIndex * 4;
      const boxOffset = (row * box.width + column) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        boxPixels[boxOffset + channel] = pixels[offset + channel];
        screen[offset + channel] = pixels[offset + channel];
      }

      changedColors[changedLength] = pixels[offset];
      changedColors[changedLength + 1] = pixels[offset + 1];
      changedColors[changedLength + 2] = pixels[offset + 2];
      changedColors[changedLength + 3] = 255;
      changedLength += 4;
    }
  }

  // The palette is made only from the changed pixels, so no colour is wasted on the transparent ones.
  const palette = quantize(changedColors.subarray(0, changedLength), MAX_COLORS);
  // Colours are matched before the transparent colour is added to the palette:
  // otherwise black pixels could be matched to the transparent [0, 0, 0] and disappear.
  const index = applyPalette(boxPixels, palette);
  const transparentIndex = palette.length;
  palette.push([0, 0, 0]);

  for (let row = 0; row < box.height; row += 1) {
    for (let column = 0; column < box.width; column += 1) {
      if (!changed[(box.y + row) * width + box.x + column]) {
        index[row * box.width + column] = transparentIndex;
      }
    }
  }

  return {...box, index, palette, transparent: true, transparentIndex};
}

async function createGif({blob, start, end, fps}) {
  const input = openWebm(blob);
  const track = await input.getPrimaryVideoTrack();

  if (!track) {
    throw new Error('No video in the recording');
  }

  const width = track.displayWidth;
  const height = track.displayHeight;
  const sink = new CanvasSink(track, {poolSize: 1});
  const gif = GIFEncoder();
  const screen = new Uint8ClampedArray(width * height * 4);
  const changed = new Uint8Array(width * height);
  const totalFrames = Math.max(1, Math.ceil((end - start) * fps));
  let pending = null;
  let frameNumber = 0;

  // A frame is written when the next changed frame is known: only then its display time is clear.
  function writePending(nextTime) {
    const delay = Math.max(MIN_DELAY_CS, toCentiseconds(nextTime - start) - toCentiseconds(pending.time - start));
    gif.writeFrame(pending.index, pending.width, pending.height, {
      palette: pending.palette,
      delay: delay * 10,
      transparent: pending.transparent,
      transparentIndex: pending.transparentIndex,
      dispose: DISPOSE_KEEP,
      x: pending.x,
      y: pending.y
    });
  }

  for await (const wrapped of sink.canvasesAtTimestamps(getFrameTimes(start, end, fps))) {
    const time = start + frameNumber / fps;
    frameNumber += 1;
    reportProgress(frameNumber / totalFrames);

    // No video frame yet at this time (the very beginning of the recording).
    if (!wrapped) {
      continue;
    }

    const context = wrapped.canvas.getContext('2d', {willReadFrequently: true});
    const pixels = context.getImageData(0, 0, width, height).data;

    if (!pending) {
      const palette = quantize(pixels, MAX_COLORS + 1);
      screen.set(pixels);
      pending = {x: 0, y: 0, width, height, index: applyPalette(pixels, palette), palette, transparent: false, time};
      continue;
    }

    const box = findChanges(pixels, screen, width, height, changed);

    if (!box) {
      continue;
    }

    writePending(time);
    pending = {...createPartialFrame(pixels, screen, changed, width, box), time};
  }

  if (!pending) {
    throw new Error('No frames in the selected part');
  }

  writePending(end);
  gif.finish();
  return new Blob([gif.bytesView()], {type: 'image/gif'});
}

self.addEventListener('message', async event => {
  const job = event.data;

  try {
    const blob = job.type === 'gif' ? await createGif(job) : await cutWebm(job.blob, job.start, job.end, reportProgress);
    postMessage({type: 'done', blob});
  } catch (error) {
    postMessage({type: 'error', message: error?.message ?? String(error)});
  }
});
