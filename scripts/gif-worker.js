// Background worker of the recording tab: turns a screen recording (WebM) into a GIF, or cuts the video.
// Runs in a worker so the page stays responsive; the page can stop it at any time (Cancel).
//
// Messages from the page:
//   {type: 'gif', blob, start, end, fps, crop}  -> {type: 'progress', value} ..., then {type: 'done', blob}
//   {type: 'video', blob, start, end, crop}     -> the same
// crop: {left, top, width, height} in video pixels, or null for the whole picture.
// On an error: {type: 'error', message}.
//
// How the GIF stays small (the same ideas as ScreenToGif's default settings):
// - Every frame is compared with what is already on the GIF screen, in 8 × 8 blocks. Only the rectangle around
//   the changed blocks is written; everything else in it is transparent, so the previous frame shows through.
// - A frame without changes is not written at all: the previous frame just stays longer on the screen.
// - Every written frame has its own palette of up to 255 colours (+1 for transparency).
// How it stays clean (the source is a compressed video, not exact screenshots): see findChanges()
// and the "settle" frames below.

import {CanvasSink} from './vendor/mediabunny.js';
import {GIFEncoder, applyPalette, quantize} from './vendor/gifenc.js';
import {cutWebm, openWebm} from './video-tools.js';

// Wider recordings (a 4K screen) are scaled down to this width: a 4K GIF is several times heavier and slower
// to make, and with Windows display scaling of 150-200 % the text stays readable at this width.
const MAX_GIF_WIDTH = 1920;
// Change detection, see findChanges(). Values chosen on real recordings of the Gestamp apps (1080p and 4K).
const CHANGE_TUNING = Object.freeze({blockSize: 8, meanThreshold: 4, peakThreshold: 40});
// "Settle" frames are compared with what the viewer sees instead of the original colours (see rememberPixel):
// blocks off by more than SETTLE_TUNING are written again with a better palette. This happens
// SETTLE_DELAYS_S after a big change (BIG_CHANGE_SHARE of the picture or more: a page was opened or reloaded)
// and also every REGULAR_SETTLE_EVERY_S. Without it, a loading page left patches of a slightly wrong colour.
const SETTLE_TUNING = Object.freeze({blockSize: 8, meanThreshold: 4, peakThreshold: 48});
const BIG_CHANGE_SHARE = 0.1;
// A pixel of a changed block is not written again when the viewer already sees a colour this close to it.
const KEEP_SHOWN_THRESHOLD = 3;
const SETTLE_DELAYS_S = Object.freeze([0.6, 1.6]);
const REGULAR_SETTLE_EVERY_S = 1;
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

// Finds what changed on the screen, in blocks of BLOCK_SIZE × BLOCK_SIZE pixels.
// A block counts as changed when its pixels differ from the GIF screen on average by more than
// BLOCK_MEAN_THRESHOLD, or when one pixel differs by more than PIXEL_PEAK_THRESHOLD.
// Why blocks: video compression adds random noise of a few levels to every pixel, while a real change
// shifts a whole area. Averaging over a block ignores the noise but still catches soft changes, such as
// a light grey background replacing a light green field (a few levels per pixel, but over the whole area).
// Pixel by pixel, such changes stayed below the threshold and the old page remained visible as a ghost.
// Fills `changed` (1 per pixel of a changed block) and returns the rectangle around the changed blocks.
function findChanges(pixels, reference, width, height, changed, tuning) {
  const {blockSize, meanThreshold, peakThreshold} = tuning;
  const blocksX = Math.ceil(width / blockSize);
  const blocksY = Math.ceil(height / blockSize);
  let left = blocksX;
  let top = blocksY;
  let right = -1;
  let bottom = -1;
  let count = 0;

  changed.fill(0);

  for (let blockY = 0; blockY < blocksY; blockY += 1) {
    const y0 = blockY * blockSize;
    const y1 = Math.min(height, y0 + blockSize);

    for (let blockX = 0; blockX < blocksX; blockX += 1) {
      const x0 = blockX * blockSize;
      const x1 = Math.min(width, x0 + blockSize);
      let sum = 0;
      let peak = 0;

      for (let y = y0; y < y1; y += 1) {
        let offset = (y * width + x0) * 4;

        for (let x = x0; x < x1; x += 1, offset += 4) {
          const difference = Math.max(
            Math.abs(pixels[offset] - reference[offset]),
            Math.abs(pixels[offset + 1] - reference[offset + 1]),
            Math.abs(pixels[offset + 2] - reference[offset + 2])
          );
          sum += difference;
          peak = Math.max(peak, difference);
        }
      }

      const pixelCount = (x1 - x0) * (y1 - y0);

      if (sum / pixelCount <= meanThreshold && peak <= peakThreshold) {
        continue;
      }

      count += pixelCount;
      left = Math.min(left, blockX);
      right = Math.max(right, blockX);
      top = Math.min(top, blockY);
      bottom = Math.max(bottom, blockY);

      for (let y = y0; y < y1; y += 1) {
        changed.fill(1, y * width + x0, y * width + x1);
      }
    }
  }

  if (right < 0) {
    return null;
  }

  const x = left * blockSize;
  const y = top * blockSize;
  return {
    x,
    y,
    width: Math.min(width, (right + 1) * blockSize) - x,
    height: Math.min(height, (bottom + 1) * blockSize) - y,
    count
  };
}

// What is on the GIF screen is kept twice:
// - `source`: the original colours of the last written pixels. New frames are compared with it to find changes.
// - `shown`: the palette colours the viewer actually sees. With only 255 colours, a busy frame (for example
//   a page that is still loading) can shift a colour by several levels; a moment later such patches are
//   compared with `shown` once and written again (see "settle" below).
function rememberPixel(gifScreen, pixels, pixelIndex, color) {
  const offset = pixelIndex * 4;

  for (let channel = 0; channel < 3; channel += 1) {
    gifScreen.source[offset + channel] = pixels[offset + channel];
    gifScreen.shown[offset + channel] = color[channel];
  }
}

// Frame with only the changed rectangle: changed pixels get their colour (and are copied to the screen),
// the others become the transparent colour.
function createPartialFrame(pixels, gifScreen, changed, width, box) {
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

      // Inside a changed block, a pixel whose shown colour is already right stays transparent:
      // long transparent runs compress much better.
      if (Math.abs(pixels[offset] - gifScreen.shown[offset]) <= KEEP_SHOWN_THRESHOLD
        && Math.abs(pixels[offset + 1] - gifScreen.shown[offset + 1]) <= KEEP_SHOWN_THRESHOLD
        && Math.abs(pixels[offset + 2] - gifScreen.shown[offset + 2]) <= KEEP_SHOWN_THRESHOLD) {
        changed[pixelIndex] = 0;
        gifScreen.source[offset] = pixels[offset];
        gifScreen.source[offset + 1] = pixels[offset + 1];
        gifScreen.source[offset + 2] = pixels[offset + 2];
        continue;
      }

      const boxOffset = (row * box.width + column) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        boxPixels[boxOffset + channel] = pixels[offset + channel];
      }

      changedColors[changedLength] = pixels[offset];
      changedColors[changedLength + 1] = pixels[offset + 1];
      changedColors[changedLength + 2] = pixels[offset + 2];
      changedColors[changedLength + 3] = 255;
      changedLength += 4;
    }
  }

  // Every pixel of the changed blocks is already shown right: nothing to write.
  if (changedLength === 0) {
    return null;
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
      const pixelIndex = (box.y + row) * width + box.x + column;
      const boxIndex = row * box.width + column;

      if (changed[pixelIndex]) {
        rememberPixel(gifScreen, pixels, pixelIndex, palette[index[boxIndex]]);
      } else {
        index[boxIndex] = transparentIndex;
      }
    }
  }

  return {...box, index, palette, transparent: true, transparentIndex};
}

async function createGif({blob, start, end, fps, crop}) {
  const input = openWebm(blob);
  const track = await input.getPrimaryVideoTrack();

  if (!track) {
    throw new Error('No video in the recording');
  }

  const sourceWidth = crop?.width ?? track.displayWidth;
  const sourceHeight = crop?.height ?? track.displayHeight;
  const scale = Math.min(1, MAX_GIF_WIDTH / sourceWidth);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const sink = new CanvasSink(track, {width, height, fit: 'fill', poolSize: 1, ...(crop ? {crop} : {})});
  const gif = GIFEncoder();
  const gifScreen = {source: new Uint8ClampedArray(width * height * 4), shown: new Uint8ClampedArray(width * height * 4)};
  let settleTimes = [];
  let nextRegularSettle = Infinity;
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
      const index = applyPalette(pixels, palette);

      for (let pixelIndex = 0; pixelIndex < index.length; pixelIndex += 1) {
        rememberPixel(gifScreen, pixels, pixelIndex, palette[index[pixelIndex]]);
      }

      settleTimes = SETTLE_DELAYS_S.map(delay => time + delay);
      nextRegularSettle = time + REGULAR_SETTLE_EVERY_S;

      pending = {x: 0, y: 0, width, height, index, palette, transparent: false, time};
      continue;
    }

    // Settle frame: compared with what the viewer sees, so colour patches left by a busy frame are fixed.
    const isSettleFrame = (settleTimes.length > 0 && time >= settleTimes[0]) || time >= nextRegularSettle;

    if (isSettleFrame) {
      if (settleTimes.length > 0 && time >= settleTimes[0]) {
        settleTimes.shift();
      }
      nextRegularSettle = time + REGULAR_SETTLE_EVERY_S;
    }

    const box = isSettleFrame
      ? findChanges(pixels, gifScreen.shown, width, height, changed, SETTLE_TUNING)
      : findChanges(pixels, gifScreen.source, width, height, changed, CHANGE_TUNING);

    if (!box) {
      continue;
    }

    if (!isSettleFrame && box.count >= width * height * BIG_CHANGE_SHARE) {
      settleTimes = SETTLE_DELAYS_S.map(delay => time + delay);
    }

    const frame = createPartialFrame(pixels, gifScreen, changed, width, box);

    if (!frame) {
      continue;
    }

    writePending(time);
    pending = {...frame, time};
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
    const blob = job.type === 'gif'
      ? await createGif(job)
      : await cutWebm(job.blob, {start: job.start, end: job.end, crop: job.crop, onProgress: reportProgress});
    postMessage({type: 'done', blob});
  } catch (error) {
    postMessage({type: 'error', message: error?.message ?? String(error)});
  }
});
