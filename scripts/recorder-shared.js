// Screen recording (Tools tab): values shared by the side panel, the service worker,
// the hidden recording page (offscreen document) and the recording tab.

// chrome.storage.session: {status, startedAt, error}.
export const RECORDER_STATE_KEY = 'recorderState';

export const RECORDER_STATUS = Object.freeze({
  idle: 'idle',
  // Chrome's "Choose what to share" dialog is open.
  choosing: 'choosing',
  recording: 'recording',
  saving: 'saving'
});

export const RECORDER_MESSAGES = Object.freeze({
  // Side panel -> service worker.
  start: 'recorder:start',
  stop: 'recorder:stop',
  // Service worker -> hidden recording page.
  offscreenStart: 'recorderOffscreen:start',
  offscreenStop: 'recorderOffscreen:stop',
  // Hidden recording page -> service worker.
  started: 'recorderOffscreen:started',
  // The recording stopped (also with Chrome's own "Stop sharing" button) and is being saved.
  saving: 'recorderOffscreen:saving',
  cancelled: 'recorderOffscreen:cancelled',
  saved: 'recorderOffscreen:saved',
  failed: 'recorderOffscreen:failed'
});

export const RECORDER_OFFSCREEN_PATH = 'pages/recorder-offscreen.html';

// A recording stops by itself after this time, so a forgotten recording does not eat all the memory.
export const MAX_RECORDING_MS = 10 * 60 * 1000;
