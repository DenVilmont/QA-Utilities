// Screen recording (Tools tab): the service worker part. Keeps the state of the recording,
// creates the hidden recording page (offscreen document) and opens the result in a new tab.
//
// Why an offscreen document: the side panel can be closed during a recording,
// and the service worker cannot record by itself. Chrome's documentation recommends
// getDisplayMedia() in an offscreen document with the DISPLAY_MEDIA reason for this case.

import {
  RECORDER_MESSAGES,
  RECORDER_OFFSCREEN_PATH,
  RECORDER_STATE_KEY,
  RECORDER_STATUS
} from './recorder-shared.js';

const RECORDING_BADGE_TEXT = 'REC';

let creatingOffscreenDocument = null;

async function getState() {
  const data = await chrome.storage.session.get(RECORDER_STATE_KEY);
  return data[RECORDER_STATE_KEY] ?? {status: RECORDER_STATUS.idle};
}

function setState(state) {
  return chrome.storage.session.set({[RECORDER_STATE_KEY]: state});
}

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  creatingOffscreenDocument ??= chrome.offscreen.createDocument({
    url: RECORDER_OFFSCREEN_PATH,
    reasons: ['DISPLAY_MEDIA'],
    justification: 'Records the tab, window or screen the user chose.'
  }).finally(() => {
    creatingOffscreenDocument = null;
  });

  await creatingOffscreenDocument;
}

async function closeOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

// Badge without a tab id: shown on every tab (tabs with an auto-reload timer show their countdown instead).
function setRecordingBadge(isRecording) {
  return chrome.action.setBadgeText({text: isRecording ? RECORDING_BADGE_TEXT : ''});
}

async function finish(state) {
  await setState(state);
  await setRecordingBadge(false);
  await closeOffscreenDocument();
}

async function startRecording() {
  const state = await getState();

  // A state left from a hidden page that no longer exists (for example, the extension was reloaded).
  if (state.status !== RECORDER_STATUS.idle && await chrome.offscreen.hasDocument()) {
    return;
  }

  await setState({status: RECORDER_STATUS.choosing});

  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({type: RECORDER_MESSAGES.offscreenStart});
  } catch (error) {
    await finish({status: RECORDER_STATUS.idle, error: error?.message ?? String(error), errorAt: Date.now()});
  }
}

async function stopRecording() {
  if (!(await chrome.offscreen.hasDocument())) {
    await finish({status: RECORDER_STATUS.idle});
    return;
  }

  await chrome.runtime.sendMessage({type: RECORDER_MESSAGES.offscreenStop});
}

async function handleOffscreenMessage(message) {
  switch (message.type) {
    case RECORDER_MESSAGES.started:
      await setState({status: RECORDER_STATUS.recording, startedAt: message.startedAt});
      await setRecordingBadge(true);
      break;
    case RECORDER_MESSAGES.saving:
      await setState({status: RECORDER_STATUS.saving});
      break;
    case RECORDER_MESSAGES.saved:
      await chrome.tabs.create({url: chrome.runtime.getURL(`pages/recording.html?id=${encodeURIComponent(message.id)}`)});
      await finish({status: RECORDER_STATUS.idle});
      break;
    case RECORDER_MESSAGES.cancelled:
      await finish({status: RECORDER_STATUS.idle});
      break;
    case RECORDER_MESSAGES.failed:
      await finish({status: RECORDER_STATUS.idle, error: message.error, errorAt: Date.now()});
      break;
  }
}

function isFromOffscreenDocument(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL(RECORDER_OFFSCREEN_PATH);
}

function handleMessage(message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  let task = null;

  if (message?.type === RECORDER_MESSAGES.start) {
    task = startRecording();
  } else if (message?.type === RECORDER_MESSAGES.stop) {
    task = stopRecording();
  } else if (Object.values(RECORDER_MESSAGES).includes(message?.type) && isFromOffscreenDocument(sender)) {
    task = handleOffscreenMessage(message);
  }

  if (!task) {
    return false;
  }

  task.then(
    () => sendResponse({ok: true}),
    error => {
      console.error('Screen recording failed.', error);
      sendResponse({ok: false, error: error?.message ?? String(error)});
    }
  );
  return true;
}

// Must be called at the top level of the service worker, so the listener exists when Chrome wakes it up.
export function registerRecorderService() {
  chrome.runtime.onMessage.addListener(handleMessage);
}
