// Recording tab: opened by the service worker when a screen recording is saved.
// Shows the video and lets the user download it. (Turning it into a GIF comes in the next step.)

import {formatDuration, formatFileSize, formatFileTimestamp} from './format.js';
import {applyTranslations, getCurrentLanguage, setCurrentLanguage, t} from './languages.js';
import {getRecording} from './recording-store.js';

let recording = null;

document.addEventListener('DOMContentLoaded', () => {
  void initPage();
});

async function initPage() {
  await setCurrentLanguage(getCurrentLanguage());
  applyTranslations();
  document.getElementById('downloadVideoButton').addEventListener('click', downloadVideo);
  window.addEventListener('storage', onStorageChange);

  const recordingId = new URLSearchParams(location.search).get('id');
  recording = recordingId ? await getRecording(recordingId).catch(() => null) : null;

  if (!recording) {
    showStageMessage(t('recordingNotFound'));
    return;
  }

  const video = document.getElementById('recordingVideo');
  // The real size of the video: the size Chrome reports when the recording starts may differ.
  video.addEventListener('loadedmetadata', renderInfo);
  video.src = URL.createObjectURL(recording.blob);
  video.hidden = false;
  document.getElementById('stageMessage').hidden = true;
  document.getElementById('downloadVideoButton').disabled = false;
  renderInfo();
}

function renderInfo() {
  if (!recording) {
    return;
  }

  const {meta, blob} = recording;
  const video = document.getElementById('recordingVideo');
  const width = video.videoWidth || meta.width;
  const height = video.videoHeight || meta.height;
  document.getElementById('recordingSize').textContent = width && height ? `${width} × ${height} px` : '';
  document.getElementById('recordingDate').textContent = new Date(meta.createdAt).toLocaleString(getCurrentLanguage());
  document.getElementById('recordingDuration').textContent = formatDuration(Math.round(meta.durationMs / 1000));
  document.getElementById('recordingFileSize').textContent = formatFileSize(blob.size);
}

function showStageMessage(text) {
  const message = document.getElementById('stageMessage');
  message.textContent = text;
  message.classList.remove('i18n');
  message.removeAttribute('data-i18n');
  message.hidden = false;
}

function downloadVideo() {
  const url = URL.createObjectURL(recording.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recording_${formatFileTimestamp(new Date(recording.meta.createdAt))}.webm`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// The language was changed in the side panel.
async function onStorageChange(event) {
  if (event.key !== 'language') {
    return;
  }

  await setCurrentLanguage(event.newValue);
  applyTranslations();
  renderInfo();
}
