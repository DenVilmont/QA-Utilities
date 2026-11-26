// Screenshot editor page: shows the capture, lets the user draw on it,
// copy it to the clipboard and download it as PNG / JPG / WebP / PDF.

import {applyTranslations, getCurrentLanguage, setCurrentLanguage, t} from './languages.js';
import {getCapture} from './capture-store.js';
import {createPdfBlob} from './pdf-export.js';
import {getScreenshotEditorSettings, setScreenshotEditorSettings} from './storage.js';
import {
  getHandles,
  getObjectBounds,
  getTextFont,
  hitTestObject,
  isSegment,
  normalizeRect,
  resizeObject,
  translateObject
} from './editor-shapes.js';

const MODE_TITLE_KEYS = Object.freeze({
  visible: 'captureVisible',
  area: 'captureArea',
  fullPage: 'captureFullPage'
});

const FONT_SIZE_BY_WIDTH = Object.freeze({2: 16, 4: 24, 8: 36});
const DEFAULT_SETTINGS = Object.freeze({tool: 'rect', color: '#e53935', width: 4});
// Crop is not remembered: starting the next screenshot in crop mode would make accidental crops easy.
const NOT_REMEMBERED_TOOLS = Object.freeze(['crop']);
// Pointer: how far from a drawing (in screen pixels) a click still selects it.
const HIT_TOLERANCE_PX = 6;
const HANDLE_SIZE_PX = 9;
const ACCENT_COLOR = '#b36531';
const RESIZE_CURSORS = Object.freeze({
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
  start: 'crosshair', end: 'crosshair'
});
const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
const MAX_UNDO_STEPS = 100;
const MIN_SHAPE_SIZE = 3;
const EXPORT_QUALITY = 0.92;
const EXPORT_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
});

const elements = {};

const state = {
  meta: null,
  base: null,           // ImageBitmap with the screenshot (changes only after crop)
  objects: [],          // drawings on top of the base image
  undoStack: [],
  redoStack: [],
  tool: DEFAULT_SETTINGS.tool,
  color: DEFAULT_SETTINGS.color,
  width: DEFAULT_SETTINGS.width,
  zoom: 1,
  fitToWindow: true,
  drawing: null,        // shape being drawn right now
  textEdit: null,       // open text input: {x, y, color, fontSize, index} (index = edited object or null)
  selectedIndex: null,  // drawing selected with the pointer tool
  dragging: null,       // pointer tool drag: {mode, handle, index, start, original, current, moved}
  hiddenIndex: null,    // drawing not painted on the image (it is being dragged or its text edited)
  hasUnsavedChanges: false
};

// ---------- Start ----------

document.addEventListener('DOMContentLoaded', () => {
  void initEditor();
});

async function initEditor() {
  cacheElements();
  await setCurrentLanguage(getCurrentLanguage());
  applyTranslations();
  bindEvents();
  restoreSettings();

  const captureId = new URLSearchParams(location.search).get('id');
  const capture = captureId ? await getCapture(captureId).catch(() => null) : null;

  if (!capture) {
    showStageMessage(t('screenshotNotFound'));
    return;
  }

  state.meta = capture.meta;
  state.base = await createImageBitmap(capture.blob);
  elements.canvasWrapper.hidden = false;
  elements.stageMessage.hidden = true;
  elements.copyButton.disabled = false;
  elements.downloadButton.disabled = false;

  renderInfo();
  render();
  applyZoom();
}

function cacheElements() {
  [
    'captureSize', 'captureMode', 'captureDate', 'captureUrl', 'captureWarning',
    'copyButton', 'formatSelect', 'downloadButton', 'toolButtons', 'colorButtons', 'customColor',
    'widthButtons', 'undoButton', 'redoButton', 'clearButton', 'zoomOutButton', 'zoomInButton',
    'zoomFitButton', 'zoomLabel', 'stage', 'canvasWrapper', 'imageCanvas', 'overlayCanvas',
    'textInput', 'stageMessage', 'toast'
  ].forEach(id => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.toolButtons.addEventListener('click', event => {
    const button = event.target.closest('[data-tool]');
    if (button) {
      selectTool(button.dataset.tool);
    }
  });
  elements.colorButtons.addEventListener('click', event => {
    const button = event.target.closest('[data-color]');
    if (button) {
      selectColor(button.dataset.color);
    }
  });
  elements.customColor.addEventListener('input', event => selectColor(event.target.value));
  elements.widthButtons.addEventListener('click', event => {
    const button = event.target.closest('[data-width]');
    if (button) {
      selectWidth(Number(button.dataset.width));
    }
  });

  elements.undoButton.addEventListener('click', undo);
  elements.redoButton.addEventListener('click', redo);
  elements.clearButton.addEventListener('click', clearAnnotations);
  elements.zoomInButton.addEventListener('click', () => changeZoom(1));
  elements.zoomOutButton.addEventListener('click', () => changeZoom(-1));
  elements.zoomFitButton.addEventListener('click', () => {
    state.fitToWindow = true;
    applyZoom();
  });
  elements.copyButton.addEventListener('click', copyToClipboard);
  elements.downloadButton.addEventListener('click', downloadImage);

  // Keeps the focus in the text input when the user clicks the image to place the next text.
  elements.imageCanvas.addEventListener('mousedown', event => event.preventDefault());
  elements.imageCanvas.addEventListener('pointerdown', onPointerDown);
  elements.imageCanvas.addEventListener('pointermove', onPointerMove);
  elements.imageCanvas.addEventListener('pointerup', onPointerUp);
  elements.imageCanvas.addEventListener('pointercancel', () => {
    cancelDrawing();
    cancelDrag();
  });
  elements.imageCanvas.addEventListener('dblclick', onDoubleClick);

  elements.textInput.addEventListener('keydown', onTextInputKeyDown);
  elements.textInput.addEventListener('blur', () => commitText());

  elements.stage.addEventListener('scroll', drawOverlay);
  window.addEventListener('resize', () => {
    if (state.fitToWindow) {
      applyZoom();
    }
    drawOverlay();
  });
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('storage', onStorageChange);
}

// ---------- Header info ----------

function renderInfo() {
  const {meta} = state;

  if (!meta) {
    return;
  }

  elements.captureSize.textContent = `${state.base.width} × ${state.base.height} px`;
  elements.captureMode.textContent = t(MODE_TITLE_KEYS[meta.mode] || 'screenshot');
  elements.captureDate.textContent = new Date(meta.createdAt).toLocaleString(getCurrentLanguage());
  elements.captureUrl.textContent = meta.title || meta.url;
  elements.captureUrl.href = meta.url;
  elements.captureUrl.title = meta.url;
  elements.captureWarning.hidden = !meta.truncated;
  elements.captureWarning.textContent = meta.truncated ? t('captureTruncated') : '';
  document.title = meta.title ? `${t('screenshot')} — ${meta.title}` : t('screenshot');
}

function showStageMessage(text) {
  elements.stageMessage.textContent = text;
  elements.stageMessage.classList.remove('i18n');
  elements.stageMessage.removeAttribute('data-i18n');
  elements.stageMessage.hidden = false;
}

async function onStorageChange(event) {
  if (event.key !== 'language') {
    return;
  }

  await setCurrentLanguage(event.newValue);
  applyTranslations();
  renderInfo();
}

// ---------- Toolbar state ----------

// Applies the tool, colour and thickness used last time (saved in localStorage).
function restoreSettings() {
  const saved = getScreenshotEditorSettings();
  const isKnownTool = Boolean(elements.toolButtons.querySelector(`[data-tool="${saved.tool}"]`));
  const isKnownWidth = Boolean(elements.widthButtons.querySelector(`[data-width="${saved.width}"]`));

  selectTool(isKnownTool && !NOT_REMEMBERED_TOOLS.includes(saved.tool) ? saved.tool : DEFAULT_SETTINGS.tool);
  selectColor(/^#[0-9a-f]{6}$/i.test(saved.color ?? '') ? saved.color : DEFAULT_SETTINGS.color);
  selectWidth(isKnownWidth ? Number(saved.width) : DEFAULT_SETTINGS.width);
}

function saveSettings() {
  const savedTool = getScreenshotEditorSettings().tool;
  setScreenshotEditorSettings({
    tool: NOT_REMEMBERED_TOOLS.includes(state.tool) ? savedTool ?? DEFAULT_SETTINGS.tool : state.tool,
    color: state.color,
    width: state.width
  });
}

function selectTool(tool) {
  commitText();
  cancelDrawing();
  clearSelection();
  state.tool = tool;
  elements.imageCanvas.style.cursor = '';
  elements.toolButtons.querySelectorAll('[data-tool]').forEach(button => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
  elements.imageCanvas.dataset.tool = tool;
  saveSettings();
}

function selectColor(color) {
  state.color = color;

  if (state.textEdit) {
    state.textEdit.color = color;
  } else {
    updateSelectedObject(object => (object.type === 'blur' ? object : {...object, color}));
  }

  elements.customColor.value = color;
  elements.colorButtons.querySelectorAll('[data-color]').forEach(button => {
    button.classList.toggle('active', button.dataset.color.toLowerCase() === color.toLowerCase());
  });
  applyTextInputStyle();
  saveSettings();
}

function selectWidth(width) {
  state.width = width;

  if (state.textEdit) {
    state.textEdit.fontSize = getFontSize(width);
  } else {
    updateSelectedObject(object => {
      if (object.type === 'text') {
        return {...object, fontSize: getFontSize(width)};
      }
      return object.type === 'blur' ? object : {...object, lineWidth: getLineWidth(width)};
    });
  }

  elements.widthButtons.querySelectorAll('[data-width]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.width) === width);
  });
  applyTextInputStyle();
  saveSettings();
}

function updateHistoryButtons() {
  elements.undoButton.disabled = state.undoStack.length === 0;
  elements.redoButton.disabled = state.redoStack.length === 0;
  elements.clearButton.disabled = state.objects.length === 0;
}

// ---------- History ----------

function pushHistory() {
  state.undoStack.push({base: state.base, objects: state.objects});

  if (state.undoStack.length > MAX_UNDO_STEPS) {
    state.undoStack.shift();
  }

  state.redoStack = [];
  state.hasUnsavedChanges = true;
}

function restoreSnapshot(snapshot) {
  clearSelection();
  const sizeChanged = snapshot.base !== state.base;
  state.base = snapshot.base;
  state.objects = snapshot.objects;
  state.hasUnsavedChanges = true;
  render();

  if (sizeChanged) {
    renderInfo();
    applyZoom();
  }
}

function undo() {
  commitText();
  const snapshot = state.undoStack.pop();

  if (snapshot) {
    state.redoStack.push({base: state.base, objects: state.objects});
    restoreSnapshot(snapshot);
  }
}

function redo() {
  commitText();
  const snapshot = state.redoStack.pop();

  if (snapshot) {
    state.undoStack.push({base: state.base, objects: state.objects});
    restoreSnapshot(snapshot);
  }
}

function addObject(object) {
  pushHistory();
  state.objects = [...state.objects, object];
  render();
}

function clearAnnotations() {
  commitText();

  if (state.objects.length === 0) {
    return;
  }

  clearSelection();
  pushHistory();
  state.objects = [];
  render();
}

// ---------- Drawing ----------

function getStrokeScale() {
  return Math.max(1, state.meta?.scale || 1);
}

function getLineWidth(width = state.width) {
  return width * getStrokeScale();
}

function getFontSize(width = state.width) {
  return (FONT_SIZE_BY_WIDTH[width] || 24) * getStrokeScale();
}

function isLightColor(color) {
  const value = Number.parseInt(color.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160;
}

function drawArrow(context, object) {
  const headLength = Math.max(12, object.lineWidth * 4);
  const angle = Math.atan2(object.y2 - object.y1, object.x2 - object.x1);
  const headAngle = Math.PI / 7;
  // Stop the line before the arrow head so its end is not visible under the tip.
  const lineEndX = object.x2 - Math.cos(angle) * headLength * 0.8;
  const lineEndY = object.y2 - Math.sin(angle) * headLength * 0.8;

  context.beginPath();
  context.moveTo(object.x1, object.y1);
  context.lineTo(lineEndX, lineEndY);
  context.stroke();

  context.beginPath();
  context.moveTo(object.x2, object.y2);
  context.lineTo(object.x2 - headLength * Math.cos(angle - headAngle), object.y2 - headLength * Math.sin(angle - headAngle));
  context.lineTo(object.x2 - headLength * Math.cos(angle + headAngle), object.y2 - headLength * Math.sin(angle + headAngle));
  context.closePath();
  context.fill();
}

// Pixelates the area: reads what is already drawn there, shrinks it and stretches it back.
function drawBlur(context, object) {
  const rect = normalizeRect(object);
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const width = Math.min(context.canvas.width - x, Math.round(rect.width));
  const height = Math.min(context.canvas.height - y, Math.round(rect.height));

  if (width <= 0 || height <= 0) {
    return;
  }

  const blockSize = Math.max(6, Math.round(8 * getStrokeScale()));
  const smallCanvas = new OffscreenCanvas(Math.max(1, Math.ceil(width / blockSize)), Math.max(1, Math.ceil(height / blockSize)));
  const smallContext = smallCanvas.getContext('2d');
  smallContext.drawImage(context.canvas, x, y, width, height, 0, 0, smallCanvas.width, smallCanvas.height);

  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(smallCanvas, 0, 0, smallCanvas.width, smallCanvas.height, x, y, width, height);
  context.restore();
}

function drawText(context, object) {
  context.font = getTextFont(object.fontSize);
  context.textBaseline = 'top';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2, object.fontSize / 7);
  context.strokeStyle = isLightColor(object.color) ? '#000000' : '#ffffff';
  context.strokeText(object.text, object.x, object.y);
  context.fillStyle = object.color;
  context.fillText(object.text, object.x, object.y);
}

function drawObject(context, object) {
  context.save();
  context.strokeStyle = object.color;
  context.fillStyle = object.color;
  context.lineWidth = object.lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (object.type === 'pen') {
    context.beginPath();
    object.points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
    if (object.points.length === 1) {
      context.lineTo(object.points[0][0] + 0.01, object.points[0][1]);
    }
    context.stroke();
  } else if (object.type === 'line') {
    context.beginPath();
    context.moveTo(object.x1, object.y1);
    context.lineTo(object.x2, object.y2);
    context.stroke();
  } else if (object.type === 'arrow') {
    drawArrow(context, object);
  } else if (object.type === 'rect') {
    const rect = normalizeRect(object);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  } else if (object.type === 'ellipse') {
    const rect = normalizeRect(object);
    context.beginPath();
    context.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
    context.stroke();
  } else if (object.type === 'blur') {
    drawBlur(context, object);
  } else if (object.type === 'text') {
    drawText(context, object);
  }

  context.restore();
}

// Draws the screenshot with all drawings. The result on this canvas is what gets copied and exported.
function render() {
  const canvas = elements.imageCanvas;

  if (canvas.width !== state.base.width || canvas.height !== state.base.height) {
    canvas.width = state.base.width;
    canvas.height = state.base.height;
  }

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.base, 0, 0);
  state.objects.forEach((object, index) => {
    if (index !== state.hiddenIndex) {
      drawObject(context, object);
    }
  });
  updateHistoryButtons();
}

// The overlay is a screen-sized canvas above the stage. The shape being drawn is shown there,
// so the big screenshot canvas is redrawn only once, when the shape is finished.
function drawOverlay() {
  const overlay = elements.overlayCanvas;
  const stageRect = elements.stage.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(stageRect.width * pixelRatio);
  const height = Math.round(stageRect.height * pixelRatio);

  Object.assign(overlay.style, {
    left: `${stageRect.left}px`,
    top: `${stageRect.top}px`,
    width: `${stageRect.width}px`,
    height: `${stageRect.height}px`
  });

  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }

  const context = overlay.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);

  if (!state.base) {
    return;
  }

  const canvasRect = elements.imageCanvas.getBoundingClientRect();
  const scale = (canvasRect.width / state.base.width) * pixelRatio;
  context.setTransform(scale, 0, 0, scale, (canvasRect.left - stageRect.left) * pixelRatio, (canvasRect.top - stageRect.top) * pixelRatio);
  // Size of one screen (CSS) pixel in image pixels: keeps frames and handles the same size at any zoom.
  const screenPixel = pixelRatio / scale;

  if (state.drawing) {
    drawDrawingPreview(context, state.drawing, screenPixel);
  }

  if (state.dragging) {
    const {current} = state.dragging;
    if (current.type === 'blur') {
      strokeDashedRect(context, normalizeRect(current), screenPixel);
    } else {
      drawObject(context, current);
    }
  }

  const selectedObject = getSelectedObject();

  if (selectedObject) {
    drawSelection(context, selectedObject, screenPixel);
  }
}

function strokeDashedRect(context, rect, screenPixel) {
  context.save();
  context.setLineDash([6 * screenPixel, 4 * screenPixel]);
  context.lineWidth = 1.5 * screenPixel;
  context.strokeStyle = '#ffffff';
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.lineDashOffset = 5 * screenPixel;
  context.strokeStyle = '#000000';
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

function drawDrawingPreview(context, drawing, screenPixel) {
  if (drawing.type !== 'blur' && drawing.type !== 'crop') {
    drawObject(context, drawing);
    return;
  }

  const rect = normalizeRect(drawing);

  if (drawing.type === 'crop') {
    // Darken everything outside the crop area.
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.beginPath();
    context.rect(0, 0, state.base.width, state.base.height);
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.fill('evenodd');
  }

  strokeDashedRect(context, rect, screenPixel);

  if (drawing.type === 'crop') {
    drawSizeLabel(context, rect, 1 / screenPixel);
  }
}

// Dashed frame around the selected drawing and the squares to resize it.
function drawSelection(context, object, screenPixel) {
  if (!isSegment(object)) {
    const bounds = getObjectBounds(object);
    const padding = (object.lineWidth || 0) / 2 + 3 * screenPixel;
    strokeDashedRect(context, {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    }, screenPixel);
  }

  const handleSize = HANDLE_SIZE_PX * screenPixel;
  context.save();
  context.lineWidth = 1.5 * screenPixel;
  context.strokeStyle = ACCENT_COLOR;
  context.fillStyle = '#ffffff';

  getHandles(object).forEach(handle => {
    context.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    context.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  });

  context.restore();
}

function drawSizeLabel(context, rect, scale) {
  const text = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  const fontSize = 12 / scale;
  context.font = `bold ${fontSize}px Arial, sans-serif`;
  const padding = 4 / scale;
  const labelWidth = context.measureText(text).width + padding * 2;
  const labelHeight = fontSize + padding * 2;
  const labelY = rect.y + rect.height + labelHeight + 4 / scale > state.base.height ? rect.y - labelHeight - 4 / scale : rect.y + rect.height + 4 / scale;
  context.fillStyle = '#b36531';
  context.fillRect(rect.x, labelY, labelWidth, labelHeight);
  context.fillStyle = '#ffffff';
  context.textBaseline = 'top';
  context.fillText(text, rect.x + padding, labelY + padding);
}

function getImagePoint(event) {
  const rect = elements.imageCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (state.base.width / rect.width),
    y: (event.clientY - rect.top) * (state.base.height / rect.height)
  };
}

function onPointerDown(event) {
  if (event.button !== 0 || !state.base) {
    return;
  }

  event.preventDefault();
  const point = getImagePoint(event);

  if (state.tool === 'text') {
    commitText();
    openTextInput(point);
    return;
  }

  if (state.tool === 'select') {
    startPointerToolAction(event, point);
    return;
  }

  elements.imageCanvas.setPointerCapture(event.pointerId);
  const common = {type: state.tool, color: state.color, lineWidth: getLineWidth()};

  state.drawing = state.tool === 'pen'
    ? {...common, points: [[point.x, point.y]]}
    : {...common, x1: point.x, y1: point.y, x2: point.x, y2: point.y};

  drawOverlay();
}

function onPointerMove(event) {
  if (!state.base) {
    return;
  }

  if (state.tool === 'select') {
    onPointerToolMove(event);
    return;
  }

  if (!state.drawing) {
    return;
  }

  const point = getImagePoint(event);

  if (state.drawing.type === 'pen') {
    state.drawing.points.push([point.x, point.y]);
  } else {
    state.drawing.x2 = Math.max(0, Math.min(state.base.width, point.x));
    state.drawing.y2 = Math.max(0, Math.min(state.base.height, point.y));

    if (event.shiftKey && state.drawing.type !== 'blur' && state.drawing.type !== 'crop') {
      applyShiftConstraint(state.drawing);
    }
  }

  drawOverlay();
}

// Shift: square / circle, or line / arrow snapped to 45 degrees.
function applyShiftConstraint(drawing) {
  const deltaX = drawing.x2 - drawing.x1;
  const deltaY = drawing.y2 - drawing.y1;

  if (isSegment(drawing)) {
    const angle = Math.round(Math.atan2(deltaY, deltaX) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(deltaX, deltaY);
    drawing.x2 = drawing.x1 + Math.cos(angle) * length;
    drawing.y2 = drawing.y1 + Math.sin(angle) * length;
    return;
  }

  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  drawing.x2 = drawing.x1 + Math.sign(deltaX || 1) * size;
  drawing.y2 = drawing.y1 + Math.sign(deltaY || 1) * size;
}

function onPointerUp() {
  if (state.dragging) {
    finishDrag();
    return;
  }

  const {drawing} = state;

  if (!drawing) {
    return;
  }

  state.drawing = null;
  drawOverlay();

  if (drawing.type === 'pen') {
    addObject(drawing);
    return;
  }

  const rect = normalizeRect(drawing);
  const isTooSmall = isSegment(drawing)
    ? Math.hypot(rect.width, rect.height) < MIN_SHAPE_SIZE
    : rect.width < MIN_SHAPE_SIZE || rect.height < MIN_SHAPE_SIZE;

  if (isTooSmall) {
    return;
  }

  if (drawing.type === 'crop') {
    void applyCrop(rect);
    return;
  }

  addObject(drawing);
}

function cancelDrawing() {
  if (state.drawing) {
    state.drawing = null;
    drawOverlay();
  }
}

// ---------- Pointer tool: select, move, resize ----------

function getScreenPixelInImage() {
  return state.base.width / elements.imageCanvas.getBoundingClientRect().width;
}

function getSelectedObject() {
  if (state.dragging) {
    return state.dragging.current;
  }

  if (state.selectedIndex === null || state.selectedIndex === state.hiddenIndex) {
    return null;
  }

  return state.objects[state.selectedIndex] ?? null;
}

function clearSelection() {
  cancelDrag();

  if (state.selectedIndex !== null) {
    state.selectedIndex = null;
    drawOverlay();
  }
}

// The topmost drawing under the point (drawings made later are on top).
function findObjectAt(point) {
  const tolerance = HIT_TOLERANCE_PX * getScreenPixelInImage();

  for (let index = state.objects.length - 1; index >= 0; index -= 1) {
    if (hitTestObject(state.objects[index], point, tolerance)) {
      return index;
    }
  }

  return null;
}

function findHandleAt(object, point) {
  const halfSize = (HANDLE_SIZE_PX / 2 + 2) * getScreenPixelInImage();
  const handle = getHandles(object).find(({x, y}) => Math.abs(point.x - x) <= halfSize && Math.abs(point.y - y) <= halfSize);
  return handle?.name ?? null;
}

function getSelectedHandleAt(point) {
  const selectedObject = state.selectedIndex !== null ? state.objects[state.selectedIndex] : null;
  return selectedObject ? findHandleAt(selectedObject, point) : null;
}

function startPointerToolAction(event, point) {
  const handle = getSelectedHandleAt(point);
  const index = handle ? state.selectedIndex : findObjectAt(point);

  if (index === null) {
    clearSelection();
    return;
  }

  const original = state.objects[index];
  state.selectedIndex = index;
  state.dragging = {mode: handle ? 'resize' : 'move', handle, index, start: point, original, current: original, moved: false};
  // While dragging, the drawing is shown on the overlay instead of the image.
  state.hiddenIndex = index;
  elements.imageCanvas.setPointerCapture(event.pointerId);
  render();
  drawOverlay();
}

function onPointerToolMove(event) {
  const point = getImagePoint(event);
  const {dragging} = state;

  if (!dragging) {
    updatePointerCursor(point);
    return;
  }

  const deltaX = point.x - dragging.start.x;
  const deltaY = point.y - dragging.start.y;
  dragging.current = dragging.mode === 'move'
    ? translateObject(dragging.original, deltaX, deltaY)
    : resizeObject(dragging.original, dragging.handle, point);
  dragging.moved = dragging.moved || deltaX !== 0 || deltaY !== 0;
  drawOverlay();
}

function updatePointerCursor(point) {
  const handle = getSelectedHandleAt(point);
  const cursor = handle ? RESIZE_CURSORS[handle] : findObjectAt(point) !== null ? 'move' : 'default';
  elements.imageCanvas.style.cursor = cursor;
}

function finishDrag() {
  const {index, current, moved} = state.dragging;
  state.dragging = null;
  state.hiddenIndex = null;

  if (moved) {
    pushHistory();
    state.objects = state.objects.map((object, objectIndex) => (objectIndex === index ? current : object));
  }

  render();
  drawOverlay();
}

function cancelDrag() {
  if (!state.dragging) {
    return;
  }

  state.dragging = null;
  state.hiddenIndex = null;
  render();
  drawOverlay();
}

// Applies the colour / thickness buttons to the selected drawing. Does nothing if nothing is selected.
function updateSelectedObject(change) {
  if (state.selectedIndex === null || state.dragging) {
    return;
  }

  const object = state.objects[state.selectedIndex];
  const changedObject = object ? change(object) : object;

  if (changedObject === object) {
    return;
  }

  pushHistory();
  state.objects = state.objects.map((item, index) => (index === state.selectedIndex ? changedObject : item));
  render();
  drawOverlay();
}

function deleteSelectedObject() {
  const index = state.selectedIndex;

  if (index === null) {
    return;
  }

  state.selectedIndex = null;
  pushHistory();
  state.objects = state.objects.filter((_, objectIndex) => objectIndex !== index);
  render();
  drawOverlay();
}

function onDoubleClick(event) {
  if (state.tool !== 'select' || !state.base) {
    return;
  }

  const index = findObjectAt(getImagePoint(event));

  if (index !== null && state.objects[index].type === 'text') {
    startTextEdit(index);
  }
}

// Crop flattens the drawings into the image. Undo brings back the previous image and drawings.
async function applyCrop(rect) {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.round(Math.min(rect.width, state.base.width - x));
  const height = Math.round(Math.min(rect.height, state.base.height - y));
  const croppedBitmap = await createImageBitmap(elements.imageCanvas, x, y, width, height);

  clearSelection();
  pushHistory();
  state.base = croppedBitmap;
  state.objects = [];
  render();
  renderInfo();
  applyZoom();
}

// ---------- Text ----------

function applyTextInputStyle() {
  const input = elements.textInput;
  const color = state.textEdit?.color ?? state.color;
  const fontSize = state.textEdit?.fontSize ?? getFontSize();
  input.style.color = color;
  input.style.fontSize = `${fontSize * state.zoom}px`;
  input.style.webkitTextStroke = `1px ${isLightColor(color) ? '#000' : 'transparent'}`;
}

function positionTextInput() {
  if (!state.textEdit) {
    return;
  }

  elements.textInput.style.left = `${state.textEdit.x * state.zoom}px`;
  elements.textInput.style.top = `${state.textEdit.y * state.zoom}px`;
  applyTextInputStyle();
}

// Opens the text input for new text, or for an existing text drawing (editedIndex).
function openTextInput(point, editedIndex = null) {
  const editedObject = editedIndex !== null ? state.objects[editedIndex] : null;
  state.textEdit = {
    x: point.x,
    y: point.y,
    color: editedObject?.color ?? state.color,
    fontSize: editedObject?.fontSize ?? getFontSize(),
    index: editedIndex
  };
  elements.textInput.value = editedObject?.text ?? '';
  elements.textInput.hidden = false;
  positionTextInput();
  // Focus right away so the first typed letters are not lost.
  // The canvas "mousedown" handler prevents the click from taking the focus back.
  elements.textInput.focus();
}

// Double click with the pointer tool: edit the text in place.
function startTextEdit(index) {
  const object = state.objects[index];
  state.selectedIndex = null;
  state.hiddenIndex = index;
  render();
  drawOverlay();
  openTextInput({x: object.x, y: object.y}, index);
}

function closeTextInput() {
  const edit = state.textEdit;
  state.textEdit = null;
  elements.textInput.hidden = true;
  elements.textInput.value = '';

  if (edit?.index !== null) {
    state.hiddenIndex = null;
  }

  return edit;
}

function commitText() {
  if (!state.textEdit) {
    return;
  }

  const text = elements.textInput.value.trim();
  const edit = closeTextInput();

  if (edit.index === null) {
    if (text) {
      addObject({type: 'text', text, x: edit.x, y: edit.y, color: edit.color, fontSize: edit.fontSize});
    }
    return;
  }

  const original = state.objects[edit.index];
  const isUnchanged = text === original.text && edit.color === original.color && edit.fontSize === original.fontSize;

  if (!isUnchanged) {
    pushHistory();
    // Empty text removes the drawing.
    state.objects = text
      ? state.objects.map((object, index) => (index === edit.index ? {...original, text, color: edit.color, fontSize: edit.fontSize} : object))
      : state.objects.filter((_, index) => index !== edit.index);
  }

  render();
}

function cancelText() {
  if (state.textEdit) {
    closeTextInput();
    render();
  }
}

function onTextInputKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitText();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelText();
  }
}

// ---------- Zoom ----------

function getFitZoom() {
  const availableWidth = elements.stage.clientWidth - 40;
  return Math.min(1, availableWidth / state.base.width);
}

function applyZoom() {
  if (!state.base) {
    return;
  }

  if (state.fitToWindow) {
    state.zoom = getFitZoom();
  }

  elements.imageCanvas.style.width = `${state.base.width * state.zoom}px`;
  elements.imageCanvas.style.height = `${state.base.height * state.zoom}px`;
  elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  elements.zoomFitButton.classList.toggle('active', state.fitToWindow);
  positionTextInput();
  drawOverlay();
}

function changeZoom(direction) {
  if (!state.base) {
    return;
  }

  const current = state.zoom;
  const nextZoom = direction > 0
    ? ZOOM_STEPS.find(step => step > current + 0.001) ?? ZOOM_STEPS.at(-1)
    : [...ZOOM_STEPS].reverse().find(step => step < current - 0.001) ?? ZOOM_STEPS[0];

  state.fitToWindow = false;
  state.zoom = nextZoom;
  applyZoom();
}

// ---------- Copy / download ----------

function canvasToBlob(type, quality) {
  return new Promise((resolve, reject) => {
    elements.imageCanvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))), type, quality);
  });
}

function getFileName(extension) {
  const date = new Date(state.meta?.createdAt || Date.now());
  const pad = value => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  let host = '';

  try {
    host = new URL(state.meta?.url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }

  return `screenshot${host ? `_${host}` : ''}_${stamp}.${extension}`;
}

async function copyToClipboard() {
  if (!state.base) {
    return;
  }

  commitText();

  try {
    // Passing a promise keeps the click "user activation", which the clipboard requires.
    await navigator.clipboard.write([new ClipboardItem({'image/png': canvasToBlob('image/png')})]);
    state.hasUnsavedChanges = false;
    showToast(t('copiedToClipboard'));
  } catch (error) {
    console.error('Failed to copy the screenshot.', error);
    showToast(`${t('copyFailed')} ${error?.message ?? ''}`.trim(), true);
  }
}

async function downloadImage() {
  if (!state.base) {
    return;
  }

  commitText();
  const format = elements.formatSelect.value;

  try {
    const blob = format === 'pdf'
      ? await createPdfBlob(elements.imageCanvas)
      : await canvasToBlob(EXPORT_TYPES[format], EXPORT_QUALITY);
    const fileName = getFileName(format);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    state.hasUnsavedChanges = false;
    showToast(t('downloadedAs').replace('$1', fileName));
  } catch (error) {
    console.error('Failed to export the screenshot.', error);
    showToast(`${t('exportFailed')} ${error?.message ?? ''}`.trim(), true);
  }
}

let toastTimer = null;

function showToast(text, isError = false) {
  elements.toast.textContent = text;
  elements.toast.classList.toggle('error', isError);
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2500);
}

// ---------- Keyboard ----------

function onKeyDown(event) {
  if (event.target === elements.textInput) {
    return;
  }

  const isModifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (key === 'escape') {
    cancelDrawing();
    clearSelection();
  } else if ((key === 'delete' || key === 'backspace') && !isModifier && state.selectedIndex !== null) {
    event.preventDefault();
    deleteSelectedObject();
  } else if (isModifier && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if (isModifier && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo();
  } else if (isModifier && key === 'c' && !window.getSelection()?.toString()) {
    event.preventDefault();
    void copyToClipboard();
  } else if (isModifier && key === 's') {
    event.preventDefault();
    void downloadImage();
  }
}

function onBeforeUnload(event) {
  if (state.hasUnsavedChanges && state.undoStack.length > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
}
