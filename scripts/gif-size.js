// Size of the GIF made from a recording. Used by the recording tab (labels) and the GIF worker (the real size),
// so both always agree.

// Wider recordings (a 4K screen) are scaled down to this width first: a 4K GIF is several times heavier and
// slower to make, and with Windows display scaling of 150-200 % the text stays readable at this width.
export const MAX_GIF_WIDTH = 1920;

// Choices of the "GIF size" list, in the order shown. 1 = 100 %.
export const GIF_SCALES = Object.freeze([1, 0.75, 0.5]);
export const DEFAULT_GIF_SCALE = 1;

// width × height: the picture to save (the crop, or the whole video); scale: one of GIF_SCALES.
export function getGifSize(width, height, scale) {
  const factor = Math.min(1, MAX_GIF_WIDTH / width) * scale;
  return {width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor))};
}
