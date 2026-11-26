// Recording tab: choosing the part of the picture to keep ("Crop frame").
// The rectangle is drawn over the video: drag on the video to draw it, drag inside it to move it,
// drag a square on its border to resize it. Outside the rectangle the video is darkened.
// The rectangle is kept in video pixels and used for both the GIF and the downloaded video.

const MIN_SIZE_PX = 16;
const HANDLES = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

let video = null;
let overlay = null;
let box = null;
let sizeLabel = null;
let crop = null;          // {left, top, width, height} in video pixels, or null for the whole picture
let isEditing = false;
let drag = null;          // {mode: 'draw' | 'move' | handle name, start, original}
let onChange = () => {};

function getScale() {
  const rect = video.getBoundingClientRect();
  return video.videoWidth ? rect.width / video.videoWidth : 1;
}

// Video encoders want even sizes; the rectangle also stays inside the picture.
function normalize(rect) {
  const left = Math.max(0, Math.min(video.videoWidth - MIN_SIZE_PX, Math.round(rect.left)));
  const top = Math.max(0, Math.min(video.videoHeight - MIN_SIZE_PX, Math.round(rect.top)));
  const width = Math.max(MIN_SIZE_PX, Math.min(video.videoWidth - left, Math.round(rect.width)));
  const height = Math.max(MIN_SIZE_PX, Math.min(video.videoHeight - top, Math.round(rect.height)));
  return {left: left - (left % 2), top: top - (top % 2), width: width - (width % 2), height: height - (height % 2)};
}

function toVideoPoint(event) {
  const rect = video.getBoundingClientRect();
  const scale = getScale();
  return {
    x: Math.max(0, Math.min(video.videoWidth, (event.clientX - rect.left) / scale)),
    y: Math.max(0, Math.min(video.videoHeight, (event.clientY - rect.top) / scale))
  };
}

// Places the overlay exactly over the picture of the video element.
export function renderCrop() {
  if (!video?.videoWidth) {
    return;
  }

  // The parent (the stage) is positioned; offsetParent cannot be used: it is null while the overlay is hidden.
  const stage = overlay.parentElement;
  const videoRect = video.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  Object.assign(overlay.style, {
    left: `${videoRect.left - stageRect.left + stage.scrollLeft}px`,
    top: `${videoRect.top - stageRect.top + stage.scrollTop}px`,
    width: `${videoRect.width}px`,
    height: `${videoRect.height}px`
  });

  overlay.hidden = !isEditing && !crop;
  overlay.classList.toggle('editing', isEditing);
  box.hidden = !crop;

  if (crop) {
    const scale = getScale();
    Object.assign(box.style, {
      left: `${crop.left * scale}px`,
      top: `${crop.top * scale}px`,
      width: `${crop.width * scale}px`,
      height: `${crop.height * scale}px`
    });
    sizeLabel.textContent = `${crop.width} × ${crop.height}`;
  }
}

function setCrop(nextCrop) {
  crop = nextCrop;
  renderCrop();
  onChange(crop);
}

function onPointerDown(event) {
  if (!isEditing || event.button !== 0) {
    return;
  }

  event.preventDefault();
  overlay.setPointerCapture(event.pointerId);
  const point = toVideoPoint(event);
  const handle = event.target.dataset.handle;
  const isInsideBox = crop && event.target.closest('.crop-box');

  drag = {
    mode: handle ?? (isInsideBox ? 'move' : 'draw'),
    start: point,
    original: crop
  };
}

function onPointerMove(event) {
  if (!drag) {
    return;
  }

  const point = toVideoPoint(event);
  const {mode, start, original} = drag;

  if (mode === 'draw') {
    setCrop(normalize({
      left: Math.min(start.x, point.x),
      top: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y)
    }));
    return;
  }

  if (mode === 'move') {
    const left = Math.max(0, Math.min(video.videoWidth - original.width, original.left + point.x - start.x));
    const top = Math.max(0, Math.min(video.videoHeight - original.height, original.top + point.y - start.y));
    setCrop(normalize({...original, left, top}));
    return;
  }

  // Resizing by a handle: move only the edges named in the handle (n, e, s, w).
  let left = original.left;
  let top = original.top;
  let right = original.left + original.width;
  let bottom = original.top + original.height;

  if (mode.includes('w')) {
    left = Math.min(point.x, right - MIN_SIZE_PX);
  }
  if (mode.includes('e')) {
    right = Math.max(point.x, left + MIN_SIZE_PX);
  }
  if (mode.includes('n')) {
    top = Math.min(point.y, bottom - MIN_SIZE_PX);
  }
  if (mode.includes('s')) {
    bottom = Math.max(point.y, top + MIN_SIZE_PX);
  }

  setCrop(normalize({left, top, width: right - left, height: bottom - top}));
}

function onPointerUp() {
  // A click without dragging (a too small rectangle) keeps the previous rectangle.
  if (drag?.mode === 'draw' && crop && (crop.width <= MIN_SIZE_PX || crop.height <= MIN_SIZE_PX)) {
    setCrop(drag.original);
  }

  drag = null;
}

export function initCrop(elements, onCropChange) {
  ({video, cropOverlay: overlay, cropBox: box, cropSize: sizeLabel} = elements);
  onChange = onCropChange;

  HANDLES.forEach(name => {
    const handle = document.createElement('div');
    handle.className = `crop-handle crop-handle-${name}`;
    handle.dataset.handle = name;
    box.appendChild(handle);
  });

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', renderCrop);
}

export function setCropEditing(editing) {
  isEditing = editing;

  // While drawing, the video stays still and its own controls do not catch the clicks.
  if (editing) {
    video.pause();
  }

  renderCrop();
}

export function isCropEditing() {
  return isEditing;
}

export function resetCrop() {
  setCrop(null);
}

export function getCrop() {
  return crop;
}
