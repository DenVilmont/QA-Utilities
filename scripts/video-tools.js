// WebM helpers built on Mediabunny (see scripts/vendor/README.md). Used by the hidden recording page
// and by the GIF worker. Video is copied without re-encoding wherever possible, so this is fast.

import {BlobSource, BufferTarget, Conversion, Input, Output, WEBM, WebMOutputFormat} from './vendor/mediabunny.js';

export function openWebm(blob) {
  return new Input({source: new BlobSource(blob), formats: [WEBM]});
}

async function convertWebm(blob, trim, onProgress) {
  const output = new Output({format: new WebMOutputFormat(), target: new BufferTarget()});
  const conversion = await Conversion.init({input: openWebm(blob), output, ...(trim ? {trim} : {})});

  if (!conversion.isValid) {
    throw new Error('This video cannot be processed');
  }

  if (onProgress) {
    conversion.onProgress = onProgress;
  }

  await conversion.execute();
  return new Blob([output.target.buffer], {type: 'video/webm'});
}

// Chrome's recorder writes WebM without its length and without a seek index: players show no duration
// and cannot jump to a moment. Writing the same video into a new file adds both.
export function remuxWebm(blob) {
  return convertWebm(blob, null);
}

// Cuts the video to [start, end] (seconds). Parts that cannot be copied as they are get encoded again.
export function cutWebm(blob, start, end, onProgress) {
  return convertWebm(blob, {start, end}, onProgress);
}
