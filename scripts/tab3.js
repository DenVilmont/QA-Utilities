// Tools tab: screenshots and clearing site data.

import {t} from './languages.js';
import {CAPTURE_MODES, cancelPendingSnip, captureArea, captureFullPage, captureVisible} from './capture-service.js';
import {clearSiteDataAndReload} from './site-data.js';
import {ToolError, ensureSiteAccess, getActiveTab} from './tab-access.js';

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

function setStatus(text, isError = false) {
  const statusElement = document.getElementById('toolsStatus');
  statusElement.textContent = text;
  statusElement.classList.toggle('error', isError);
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

function getErrorText(error) {
  if (error instanceof ToolError) {
    // Chrome's own error text helps to understand what went wrong (for example, a company policy).
    const message = t(error.messageKey);
    return error.details ? `${message} (${error.details})` : message;
  }

  console.error('Tool action failed.', error);
  return `${t('actionFailed')} ${error?.message ?? ''}`.trim();
}

// `work(tab)` does the job and returns the text to show when it is finished.
async function runTool(action, work) {
  if (activeAction === ACTIONS.area) {
    cancelPendingSnip();
  } else if (activeAction !== null) {
    return;
  }

  const runId = ++latestRunId;
  const workingStatus = t(WORKING_STATUS_KEYS[action]);
  setBusy(action);
  setStatus(workingStatus);

  try {
    // Asks Chrome for site access if it was limited ("On click") in the extension settings.
    // Must stay the first "await" in this function: see ensureSiteAccess.
    await ensureSiteAccess(() => setStatus(t('allowSiteAccess')));
    setStatus(workingStatus);
    const tab = await getActiveTab();
    const resultText = await work(tab);

    if (runId === latestRunId) {
      setStatus(resultText);
    }
  } catch (error) {
    if (runId === latestRunId) {
      setStatus(getErrorText(error), true);
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
    setStatus(t('capturingProgress').replace('$1', part).replace('$2', totalParts));
  })));
}

export function clearSiteData() {
  return runTool(ACTIONS.clearSiteData, async tab => {
    const hostname = await clearSiteDataAndReload(tab);
    return t('siteDataCleared').replace('$1', hostname);
  });
}
