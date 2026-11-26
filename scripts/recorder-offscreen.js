// Hidden recording page (offscreen document), created by the service worker for the time of a recording.
// Asks Chrome for the window / tab / screen to record (Chrome shows its own dialog), records it as WebM,
// saves the file to IndexedDB and reports back to the service worker.
// Only chrome.runtime works in an offscreen document, so everything else goes through messages.

import {MAX_RECORDING_MS, RECORDER_MESSAGES} from './recorder-shared.js';
import {saveRecording} from './recording-store.js';

const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
// Enough for sharp text in a screen recording; screen content compresses well.
const VIDEO_BITS_PER_SECOND = 6000000;
const FRAME_RATE = 30;
const CHUNK_INTERVAL_MS = 1000;

let recorder = null;
let stream = null;
let chunks = [];
let startedAt = 0;
let autoStopTimer = null;

function report(type, details = {}) {
  return chrome.runtime.sendMessage({type, ...details}).catch(() => {});
}

function stopStream() {
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
}

async function startRecording() {
  if (recorder) {
    return;
  }

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {frameRate: {ideal: FRAME_RATE, max: FRAME_RATE}},
      audio: false
    });
  } catch (error) {
    // The user closed Chrome's dialog with "Cancel".
    if (error?.name === 'NotAllowedError') {
      await report(RECORDER_MESSAGES.cancelled);
    } else {
      await report(RECORDER_MESSAGES.failed, {error: error?.message ?? String(error)});
    }
    return;
  }

  const [videoTrack] = stream.getVideoTracks();
  const settings = videoTrack.getSettings();
  const mimeType = VIDEO_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? '';

  chunks = [];
  recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND});
  recorder.addEventListener('dataavailable', event => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.addEventListener('stop', () => void finishRecording(settings));
  // Chrome's own "Stop sharing" button ends the track.
  videoTrack.addEventListener('ended', stopRecording);

  recorder.start(CHUNK_INTERVAL_MS);
  startedAt = Date.now();
  autoStopTimer = setTimeout(stopRecording, MAX_RECORDING_MS);
  await report(RECORDER_MESSAGES.started, {startedAt});
}

function stopRecording() {
  clearTimeout(autoStopTimer);

  if (recorder?.state === 'recording') {
    recorder.stop();
  }
}

async function finishRecording(settings) {
  await report(RECORDER_MESSAGES.saving);
  const durationMs = Date.now() - startedAt;
  const blob = new Blob(chunks, {type: recorder.mimeType || 'video/webm'});
  recorder = null;
  chunks = [];
  stopStream();

  try {
    const id = await saveRecording(blob, {
      createdAt: startedAt,
      durationMs,
      width: settings.width ?? 0,
      height: settings.height ?? 0,
      // "browser" (tab), "window" or "monitor" (screen).
      surface: settings.displaySurface ?? ''
    });
    await report(RECORDER_MESSAGES.saved, {id});
  } catch (error) {
    await report(RECORDER_MESSAGES.failed, {error: error?.message ?? String(error)});
  }
}

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === RECORDER_MESSAGES.offscreenStart) {
    void startRecording();
  } else if (message?.type === RECORDER_MESSAGES.offscreenStop) {
    stopRecording();
  }

  return false;
});
