// Tools tab: screenshots and clearing site data.

import {t} from './languages.js';
import {hideMessage, showError, showMessage} from './notify.js';
import {CAPTURE_MODES, cancelPendingSnip, captureArea, captureFullPage, captureVisible} from './capture-service.js';
import {clearSiteDataAndReload} from './site-data.js';
import {ensureSiteAccess, getActiveTab} from './tab-access.js';

const ACTIONS = Object.freeze({
  ...CAPTURE_MODES,
  clearSiteData: 'clearSiteData'
});

const ACTION_BUTTON_IDS = Object.freeze({
  [ACTIONS.visible]: 'captureVisibleButton',
  [ACTIONS.area]: 'captureAreaButton',
  [ACTIONS.fullPage]: 'captureFullPageButton',
  [ACTIONS.clearSiteData]: 'clearSiteDataButton'
});

const WORKING_STATUS_KEYS = Object.freeze({
  [ACTIONS.visible]: 'capturing',
  [ACTIONS.area]: 'selectAreaOnPage',
  [ACTIONS.fullPage]: 'capturing',
  [ACTIONS.clearSiteData]: 'clearingSiteData'
});

// Only one action at a time. "Select area" can be interrupted while it waits for the selection.
let activeAction = null;
let latestRunId = 0;

// "Working..." and progress messages stay on screen until the action finishes.
function showProgress(text) {
  showMessage(text, {sticky: true});
}

function setBusy(action) {
  activeAction = action;

  Object.entries(ACTION_BUTTON_IDS).forEach(([buttonAction, buttonId]) => {
    const button = document.getElementById(buttonId);
    button.classList.toggle('active', buttonAction === action);
    // While the area overlay is waiting, the other buttons stay available.
    button.disabled = action !== null && action !== ACTIONS.area;
  });
}

// `work(tab)` does the job and returns the text to show when it is finished (an empty text shows nothing).
async function runTool(action, work) {
  if (activeAction === ACTIONS.area) {
    cancelPendingSnip();
  } else if (activeAction !== null) {
    return;
  }

  const runId = ++latestRunId;
  const workingStatus = t(WORKING_STATUS_KEYS[action]);
  setBusy(action);
  showProgress(workingStatus);

  try {
    // Asks Chrome for site access if it was limited ("On click") in the extension settings.
    // Must stay the first "await" in this function: see ensureSiteAccess.
    await ensureSiteAccess(() => showProgress(t('allowSiteAccess')));
    showProgress(workingStatus);
    const tab = await getActiveTab();
    const resultText = await work(tab);

    if (runId === latestRunId) {
      if (resultText) {
        showMessage(resultText);
      } else {
        hideMessage();
      }
    }
  } catch (error) {
    if (runId === latestRunId) {
      showError(error);
    }
  } finally {
    // A newer action (restarted "Select area") owns the UI now.
    if (runId === latestRunId) {
      setBusy(null);
    }
  }
}

function getCaptureResultText(captureId) {
  return captureId ? '' : t('captureCancelled');
}

export function captureVisibleArea() {
  return runTool(ACTIONS.visible, async tab => getCaptureResultText(await captureVisible(tab)));
}

export function captureSelectedArea() {
  return runTool(ACTIONS.area, async tab => getCaptureResultText(await captureArea(tab)));
}

export function captureWholePage() {
  return runTool(ACTIONS.fullPage, async tab => getCaptureResultText(await captureFullPage(tab, (part, totalParts) => {
    showProgress(t('capturingProgress').replace('$1', part).replace('$2', totalParts));
  })));
}

export function clearSiteData() {
  return runTool(ACTIONS.clearSiteData, async tab => {
    const hostname = await clearSiteDataAndReload(tab);
    return t('siteDataCleared').replace('$1', hostname);
  });
}
