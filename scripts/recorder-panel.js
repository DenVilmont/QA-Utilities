// Screen recording (Tools tab): the side panel part — one tile that starts and stops the recording.
// The recording itself runs in a hidden page (see recorder-service.js), so the panel may be closed meanwhile.

import {formatDuration} from './format.js';
import {t} from './languages.js';
import {showError, showMessage} from './notify.js';
import {RECORDER_MESSAGES, RECORDER_STATE_KEY, RECORDER_STATUS} from './recorder-shared.js';

let recorderState = {status: RECORDER_STATUS.idle};
let elapsedTimer = null;

function getTitleText() {
  switch (recorderState.status) {
    case RECORDER_STATUS.choosing:
      return t('recordChoosing');
    case RECORDER_STATUS.recording:
      return `${t('recordStop')} ${formatDuration(Math.floor((Date.now() - recorderState.startedAt) / 1000))}`;
    case RECORDER_STATUS.saving:
      return t('recordSaving');
    default:
      return t('recordStart');
  }
}

function updateElapsedTimer() {
  const isRecording = recorderState.status === RECORDER_STATUS.recording;

  if (isRecording && elapsedTimer === null) {
    elapsedTimer = setInterval(refreshRecorderView, 1000);
  } else if (!isRecording && elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

export function refreshRecorderView() {
  const button = document.getElementById('recordButton');
  const {status} = recorderState;

  button.classList.toggle('active', status !== RECORDER_STATUS.idle);
  button.classList.toggle('recording', status === RECORDER_STATUS.recording);
  // While Chrome's dialog is open or the file is being saved, there is nothing to click.
  button.disabled = status === RECORDER_STATUS.choosing || status === RECORDER_STATUS.saving;
  document.getElementById('recordButtonTitle').textContent = getTitleText();
  updateElapsedTimer();
}

function applyState(nextState, previousState) {
  recorderState = nextState ?? {status: RECORDER_STATUS.idle};
  refreshRecorderView();

  // An error is shown once, when it appears (the state is shared by the panels of all windows).
  if (recorderState.error && recorderState.errorAt !== previousState?.errorAt) {
    showMessage(`${t('recordFailed')} ${recorderState.error}`, {isError: true});
  }
}

export async function initRecorder() {
  chrome.storage.session.onChanged.addListener(changes => {
    if (RECORDER_STATE_KEY in changes) {
      applyState(changes[RECORDER_STATE_KEY].newValue, changes[RECORDER_STATE_KEY].oldValue);
    }
  });

  const data = await chrome.storage.session.get(RECORDER_STATE_KEY);
  // An old error is not shown again when the panel opens.
  applyState(data[RECORDER_STATE_KEY], data[RECORDER_STATE_KEY]);
}

export async function toggleRecording() {
  const type = recorderState.status === RECORDER_STATUS.recording ? RECORDER_MESSAGES.stop : RECORDER_MESSAGES.start;

  try {
    const response = await chrome.runtime.sendMessage({type});

    if (!response?.ok) {
      throw new Error(response?.error ?? '');
    }
  } catch (error) {
    showError(error);
  }
}
