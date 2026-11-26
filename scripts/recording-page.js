// Recording tab: opened by the service worker when a screen recording is saved.
// Shows the video, lets the user choose the part to keep (trim) and save it as a video or a GIF.
// The heavy work (GIF, cutting the video) runs in scripts/gif-worker.js, so the page stays responsive.

import {formatDuration, formatFileSize, formatFileTimestamp, formatPreciseTime} from './format.js';
import {applyTranslations, getCurrentLanguage, setCurrentLanguage, t} from './languages.js';
import {hideMessage, showMessage} from './notify.js';
import {DEFAULT_GIF_SCALE, GIF_SCALES, getGifSize} from './gif-size.js';
import {getGifScale, setGifScale} from './storage.js';
import {getCrop, initCrop, isCropEditing, renderCrop, resetCrop, setCropEditing} from './recording-crop.js';
import {getRecording} from './recording-store.js';

// Like ScreenToGif's default.
const GIF_FPS = 15;
// The selection can never be shorter than this (seconds).
const MIN_SELECTION_S = 0.2;
// Below this difference the selection counts as "the whole video": the original file is downloaded as it is.
const WHOLE_VIDEO_TOLERANCE_S = 0.05;

const elements = {};
let recording = null;
let duration = 0;
let selection = {start: 0, end: 0};
// The running job: {worker, cancel()}; null when nothing runs.
let currentJob = null;

class JobCancelledError extends Error {}

document.addEventListener('DOMContentLoaded', () => {
  void initPage();
});

async function initPage() {
  [
    'recordingSize', 'recordingDate', 'recordingDuration', 'recordingFileSize', 'downloadVideoButton',
    'createGifButton', 'cancelJobButton', 'recordingVideo', 'stageMessage', 'trimPanel', 'trimStart', 'trimEnd',
    'trimSelection', 'trimStartButton', 'trimEndButton', 'trimLabel', 'cropOverlay', 'cropBox', 'cropSize',
    'cropButton', 'cropButtonText', 'resetCropButton', 'gifScaleSelect'
  ].forEach(id => {
    elements[id] = document.getElementById(id);
  });

  await setCurrentLanguage(getCurrentLanguage());
  applyTranslations();
  bindEvents();
  renderCropControls();

  const recordingId = new URLSearchParams(location.search).get('id');
  recording = recordingId ? await getRecording(recordingId).catch(() => null) : null;

  if (!recording) {
    showStageMessage(t('recordingNotFound'));
    return;
  }

  elements.recordingVideo.src = URL.createObjectURL(recording.blob);
  elements.recordingVideo.hidden = false;
  elements.stageMessage.hidden = true;
  renderInfo();
}

function bindEvents() {
  const video = elements.recordingVideo;
  video.addEventListener('loadedmetadata', onVideoLoaded);
  video.addEventListener('timeupdate', keepPlaybackInSelection);
  elements.trimStart.addEventListener('input', () => onHandleMoved('start'));
  elements.trimEnd.addEventListener('input', () => onHandleMoved('end'));
  elements.trimStartButton.addEventListener('click', () => setSelectionEdge('start', video.currentTime));
  elements.trimEndButton.addEventListener('click', () => setSelectionEdge('end', video.currentTime));
  elements.downloadVideoButton.addEventListener('click', downloadVideo);
  elements.createGifButton.addEventListener('click', createGif);
  elements.cancelJobButton.addEventListener('click', cancelJob);
  elements.gifScaleSelect.addEventListener('change', () => setGifScale(Number(elements.gifScaleSelect.value)));
  elements.cropButton.addEventListener('click', () => setCropMode(!isCropEditing()));
  elements.resetCropButton.addEventListener('click', resetCrop);
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === 'Escape') && isCropEditing()) {
      // Otherwise Enter would also "click" the focused Crop button and switch the editing on again.
      event.preventDefault();
      setCropMode(false);
    }
  });
  window.addEventListener('storage', onStorageChange);
  initCrop({
    video: elements.recordingVideo,
    cropOverlay: elements.cropOverlay,
    cropBox: elements.cropBox,
    cropSize: elements.cropSize
  }, renderCropControls);
}

// ---------- Crop ----------

function setCropMode(isEditing) {
  setCropEditing(isEditing);
  renderCropControls();
}

// "100 % · 1920 × 659": the real GIF size for the current crop (or the whole video).
function renderGifScaleOptions() {
  const video = elements.recordingVideo;
  const crop = getCrop();
  const width = crop?.width ?? video.videoWidth;
  const height = crop?.height ?? video.videoHeight;
  const savedScale = getGifScale();
  const selectedScale = GIF_SCALES.includes(savedScale) ? savedScale : DEFAULT_GIF_SCALE;

  elements.gifScaleSelect.replaceChildren(...GIF_SCALES.map(scale => {
    const option = document.createElement('option');
    const size = width && height ? getGifSize(width, height, scale) : null;
    option.value = String(scale);
    option.textContent = `${Math.round(scale * 100)} %${size ? ` · ${size.width} × ${size.height}` : ''}`;
    option.selected = scale === selectedScale;
    return option;
  }));
}

function renderCropControls() {
  renderGifScaleOptions();
  const crop = getCrop();
  const isEditing = isCropEditing();
  elements.cropButton.classList.toggle('active', isEditing);
  elements.cropButtonText.textContent = isEditing
    ? t('cropDone')
    : crop ? `${crop.width} × ${crop.height}` : t('cropFrame');
  elements.resetCropButton.hidden = !crop;
}

// ---------- Info ----------

function renderInfo() {
  if (!recording) {
    return;
  }

  const {meta, blob} = recording;
  const video = elements.recordingVideo;
  // The real size of the video: the size Chrome reports when the recording starts may differ.
  const width = video.videoWidth || meta.width;
  const height = video.videoHeight || meta.height;
  elements.recordingSize.textContent = width && height ? `${width} × ${height} px` : '';
  elements.recordingDate.textContent = new Date(meta.createdAt).toLocaleString(getCurrentLanguage());
  elements.recordingDuration.textContent = formatDuration(Math.round(duration || meta.durationMs / 1000));
  elements.recordingFileSize.textContent = formatFileSize(blob.size);
  renderSelection();
}

function showStageMessage(text) {
  elements.stageMessage.textContent = text;
  elements.stageMessage.classList.remove('i18n');
  elements.stageMessage.removeAttribute('data-i18n');
  elements.stageMessage.hidden = false;
}

// ---------- Trim ----------

function onVideoLoaded() {
  // Old recordings (saved before the file was rewritten after recording) have no length: no trimming then.
  duration = Number.isFinite(elements.recordingVideo.duration) ? elements.recordingVideo.duration : 0;
  selection = {start: 0, end: duration};

  if (duration > 0) {
    [elements.trimStart, elements.trimEnd].forEach(handle => {
      handle.max = String(duration);
    });
    elements.trimPanel.hidden = false;
  }

  elements.downloadVideoButton.disabled = false;
  elements.createGifButton.disabled = duration <= 0;
  renderInfo();
  renderCrop();
  renderGifScaleOptions();
}

function renderSelection() {
  if (duration <= 0) {
    return;
  }

  elements.trimStart.value = String(selection.start);
  elements.trimEnd.value = String(selection.end);
  elements.trimSelection.style.left = `${(selection.start / duration) * 100}%`;
  elements.trimSelection.style.width = `${((selection.end - selection.start) / duration) * 100}%`;
  elements.trimLabel.textContent = `${formatPreciseTime(selection.start)} – ${formatPreciseTime(selection.end)}`
    + ` · ${(selection.end - selection.start).toFixed(1)} ${t('secondsShort')}`;
}

function setSelectionEdge(edge, time) {
  if (edge === 'start') {
    selection.start = Math.max(0, Math.min(time, selection.end - MIN_SELECTION_S));
  } else {
    selection.end = Math.min(duration, Math.max(time, selection.start + MIN_SELECTION_S));
  }

  renderSelection();
}

// Dragging a handle shows the frame at that moment.
function onHandleMoved(edge) {
  const handle = edge === 'start' ? elements.trimStart : elements.trimEnd;
  setSelectionEdge(edge, Number(handle.value));
  elements.recordingVideo.pause();
  elements.recordingVideo.currentTime = selection[edge];
}

// Playback repeats only the selected part.
function keepPlaybackInSelection() {
  const video = elements.recordingVideo;

  if (duration > 0 && !video.paused && (video.currentTime >= selection.end || video.currentTime < selection.start - 0.1)) {
    video.currentTime = selection.start;
  }
}

// The whole length and the whole picture: the original file can be downloaded as it is.
function isWholeVideo() {
  return !getCrop() && selection.start <= WHOLE_VIDEO_TOLERANCE_S && selection.end >= duration - WHOLE_VIDEO_TOLERANCE_S;
}

// ---------- Jobs: GIF and cut video ----------

function getFileName(extension) {
  return `recording_${formatFileTimestamp(new Date(recording.meta.createdAt))}.${extension}`;
}

function saveFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  showMessage(`${t('downloadedAs').replace('$1', fileName)} (${formatFileSize(blob.size)})`);
}

// progressKey: message shown while working; null when the job is over.
function setBusy(progressKey) {
  const isBusy = progressKey !== null;
  elements.downloadVideoButton.disabled = isBusy;
  elements.createGifButton.disabled = isBusy;
  elements.trimStart.disabled = isBusy;
  elements.trimEnd.disabled = isBusy;
  elements.trimStartButton.disabled = isBusy;
  elements.trimEndButton.disabled = isBusy;
  elements.cropButton.disabled = isBusy;
  elements.gifScaleSelect.disabled = isBusy;
  elements.resetCropButton.disabled = isBusy;
  elements.cancelJobButton.hidden = !isBusy;

  if (isBusy && isCropEditing()) {
    setCropMode(false);
  }

  if (isBusy) {
    showMessage(t(progressKey).replace('$1', '0'), {sticky: true});
  }
}

function runJob(job, progressKey) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(chrome.runtime.getURL('scripts/gif-worker.js'), {type: 'module'});
    currentJob = {worker, cancel: () => reject(new JobCancelledError())};
    worker.addEventListener('message', ({data}) => {
      if (data.type === 'progress') {
        showMessage(t(progressKey).replace('$1', String(Math.round(data.value * 100))), {sticky: true});
      } else if (data.type === 'done') {
        resolve(data.blob);
      } else if (data.type === 'error') {
        reject(new Error(data.message));
      }
    });
    worker.addEventListener('error', event => reject(new Error(event.message)));
    worker.postMessage({...job, blob: recording.blob, start: selection.start, end: selection.end, crop: getCrop()});
  }).finally(() => {
    currentJob?.worker.terminate();
    currentJob = null;
  });
}

async function runAndSave(job, progressKey, extension) {
  setBusy(progressKey);

  try {
    const blob = await runJob(job, progressKey);
    saveFile(blob, getFileName(extension));
  } catch (error) {
    if (error instanceof JobCancelledError) {
      hideMessage();
    } else {
      console.error('Failed to save the recording.', error);
      showMessage(`${t('exportFailed')} ${error?.message ?? ''}`.trim(), {isError: true});
    }
  } finally {
    setBusy(null);
  }
}

function downloadVideo() {
  if (isWholeVideo()) {
    saveFile(recording.blob, getFileName('webm'));
    return;
  }

  void runAndSave({type: 'video'}, 'cuttingVideo', 'webm');
}

function createGif() {
  void runAndSave({type: 'gif', fps: GIF_FPS, scale: Number(elements.gifScaleSelect.value)}, 'creatingGif', 'gif');
}

function cancelJob() {
  currentJob?.cancel();
}

// ---------- Language ----------

// The language was changed in the side panel.
async function onStorageChange(event) {
  if (event.key !== 'language') {
    return;
  }

  await setCurrentLanguage(event.newValue);
  applyTranslations();
  renderInfo();
  renderCropControls();
}
