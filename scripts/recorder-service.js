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
const CLICK_HIGHLIGHT_SCRIPT_ID = 'qa-utilities-click-highlight';
const CLICK_HIGHLIGHT_FILE = 'scripts/page/click-highlight.js';

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

// Circles on clicks while recording: in the pages that are already open, and (through a registered
// content script) in every page opened or reloaded during the recording, in any tab.
// Browser pages (chrome://, the Web Store) cannot be scripted: there are no circles there.
async function startClickHighlight() {
  await chrome.scripting.registerContentScripts([{
    id: CLICK_HIGHLIGHT_SCRIPT_ID,
    matches: ['<all_urls>'],
    js: [CLICK_HIGHLIGHT_FILE],
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: false
  }]).catch(() => {});

  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    files: [CLICK_HIGHLIGHT_FILE]
  }).catch(() => {})));
}

async function stopClickHighlight() {
  await chrome.scripting.unregisterContentScripts({ids: [CLICK_HIGHLIGHT_SCRIPT_ID]}).catch(() => {});

  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    func: () => globalThis.qaUtilitiesClickHighlight?.stop()
  }).catch(() => {})));
}

async function finish(state) {
  await setState(state);
  await setRecordingBadge(false);
  await stopClickHighlight();
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
      await startClickHighlight();
      break;
    case RECORDER_MESSAGES.saving:
      await setState({status: RECORDER_STATUS.saving});
      await stopClickHighlight();
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
