import * as languages from './languages.js';
import * as recorder from './recorder-panel.js';
import * as reloadTimer from './reload-timer-panel.js';
import * as storage from './storage.js';
import * as tab1 from './tab1.js';
import * as tab2 from './tab2.js';
import * as tab3 from './tab3.js';
import * as testData from './test-data-panel.js';

const elements = {};

let appState = {
  checkedTabId: storage.DEFAULT_CHECKED_TAB_ID,
  language: storage.DEFAULT_LANGUAGE
};

document.addEventListener('DOMContentLoaded', () => {
  void bootstrapApp();
});

async function bootstrapApp() {
  cacheElements();
  bindEvents();
  loadInitialState();
  await renderInitialUI();
  activateInitialTab();
}

function cacheElements() {
  elements.languageSelect = document.getElementById('languageSelect');
  elements.tabHeaders = document.querySelectorAll('.tab-header');
  elements.tabContents = document.querySelectorAll('.tab-content');
  elements.tabContentsById = new Map(
    Array.from(elements.tabContents).map(tabContent => [getTabIdForContent(tabContent), tabContent])
  );
  elements.copyRandomTextButton = document.getElementById('copyRandomTextButton');
  elements.clearRandomTextButton = document.getElementById('clearRandomTextButton');
  elements.generateTextButton = document.getElementById('generateText');
  elements.randomTextTextarea = document.getElementById('randomTextTextarea');
  elements.copyHexButton = document.getElementById('copyHexButton');
  elements.clearHexButton = document.getElementById('clearHexButton');
  elements.saveValueButton = document.getElementById('saveValueButton');
  elements.valueInput = document.getElementById('valueInput');
  elements.savedValues = document.getElementById('savedValues');
  elements.notebook = document.getElementById('notebook');
  elements.clearNotebookButton = document.getElementById('clearNotebookButton');
  elements.hexUpButton = document.getElementById('hexUp');
  elements.hexDownButton = document.getElementById('hexDown');
  elements.hexCharText = document.getElementById('hexCharText');
  elements.textLength = document.getElementById('textLength');
  elements.captureVisibleButton = document.getElementById('captureVisibleButton');
  elements.captureAreaButton = document.getElementById('captureAreaButton');
  elements.captureFullPageButton = document.getElementById('captureFullPageButton');
  elements.clearSiteDataButton = document.getElementById('clearSiteDataButton');
  elements.recordButton = document.getElementById('recordButton');
  elements.reloadTimerPresets = document.getElementById('reloadTimerPresets');
  elements.reloadTimerSeconds = document.getElementById('reloadTimerSeconds');
  elements.reloadTimerStartButton = document.getElementById('reloadTimerStartButton');
  elements.reloadTimerStopButton = document.getElementById('reloadTimerStopButton');
  elements.reloadTimerList = document.getElementById('reloadTimerList');
}

function bindEvents() {
  elements.languageSelect.addEventListener('change', handleLanguageChange);
  elements.tabHeaders.forEach(tabHeader => {
    tabHeader.addEventListener('click', handleTabHeaderClick);
  });
  elements.copyRandomTextButton.addEventListener('click', tab1.copyGeneratedText);
  elements.clearRandomTextButton.addEventListener('click', tab1.clearGeneratedText);
  elements.generateTextButton.addEventListener('click', tab1.generateText);
  elements.randomTextTextarea.addEventListener('input', tab1.updateGeneratedTextLengthIndicator);
  elements.copyHexButton.addEventListener('click', tab1.copyHexCharacter);
  elements.clearHexButton.addEventListener('click', tab1.clearHexInput);
  elements.saveValueButton.addEventListener('click', tab2.saveValue);
  elements.valueInput.addEventListener('keydown', handleValueInputKeydown);
  elements.savedValues.addEventListener('click', tab2.handleSavedValueClick);
  elements.notebook.addEventListener('input', tab2.saveNotebookContent);
  elements.clearNotebookButton.addEventListener('click', tab2.clearNotebook);
  elements.hexUpButton.addEventListener('click', () => tab1.stepHexInput(1));
  elements.hexDownButton.addEventListener('click', () => tab1.stepHexInput(-1));
  elements.hexCharText.addEventListener('wheel', event => handleWheelStep(event, tab1.stepHexInput));
  elements.textLength.addEventListener('wheel', event => handleWheelStep(event, tab1.stepTextLengthInput));
  elements.captureVisibleButton.addEventListener('click', tab3.captureVisibleArea);
  elements.captureAreaButton.addEventListener('click', tab3.captureSelectedArea);
  elements.captureFullPageButton.addEventListener('click', tab3.captureWholePage);
  elements.clearSiteDataButton.addEventListener('click', tab3.clearSiteData);
  elements.recordButton.addEventListener('click', recorder.toggleRecording);
  elements.reloadTimerPresets.addEventListener('click', reloadTimer.handlePresetClick);
  elements.reloadTimerSeconds.addEventListener('keydown', handleReloadTimerSecondsKeydown);
  elements.reloadTimerSeconds.addEventListener('wheel', event => handleWheelStep(event, reloadTimer.stepCustomSeconds));
  elements.reloadTimerStartButton.addEventListener('click', reloadTimer.startCustomTimer);
  elements.reloadTimerStopButton.addEventListener('click', reloadTimer.stopActiveTabTimer);
  elements.reloadTimerList.addEventListener('click', reloadTimer.handleTimerListClick);
  window.addEventListener('storage', handleStorageChange);
}

// Fires when another open panel (in another Chrome window) or the test data page changes localStorage.
// Reload the data from storage so this panel does not overwrite it with an outdated copy.
function handleStorageChange(event) {
  const changedKey = event.key;
  const isFullClear = changedKey === null;

  if (isFullClear || changedKey === storage.SYNCED_STORAGE_KEYS.savedValues) {
    tab2.loadSavedValues();
  }

  if (isFullClear || changedKey === storage.SYNCED_STORAGE_KEYS.notebookContent) {
    tab2.loadNotebookContent();
  }

  if (isFullClear || changedKey === storage.SYNCED_STORAGE_KEYS.testData) {
    testData.reloadTestData();
  }
}

function loadInitialState() {
  appState = {
    checkedTabId: getStoredTabId(),
    language: languages.getCurrentLanguage()
  };

  elements.languageSelect.value = appState.language;
}

async function renderInitialUI() {
  renderVersion();
  await languages.setCurrentLanguage(appState.language);
  tab2.loadSavedValues();
  tab2.loadNotebookContent();
  testData.initTestData();
  languages.applyTranslations();
  // Not awaited: the panel must not wait for the tab list to show up.
  reloadTimer.initReloadTimer().catch(error => console.error('Failed to load auto-reload timers.', error));
  recorder.initRecorder().catch(error => console.error('Failed to load the recording state.', error));
}

function activateInitialTab() {
  activateTab(appState.checkedTabId);
}

function handleTabHeaderClick(event) {
  activateTab(event.currentTarget.id);
}

function handleValueInputKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    tab2.saveValue();
  }
}

function handleReloadTimerSecondsKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    reloadTimer.startCustomTimer();
  }
}

async function handleLanguageChange(event) {
  const didLoadLatestLanguage = await languages.setCurrentLanguage(event.target.value);

  if (!didLoadLatestLanguage) {
    return;
  }

  appState.language = languages.getCurrentLanguage();
  tab2.refreshSavedValuesView();
  testData.refreshTestDataView();
  languages.applyTranslations();
  reloadTimer.refreshReloadTimerView();
  recorder.refreshRecorderView();
}

// Mouse wheel over a number field (text length, HEX, auto-reload seconds): up = +1, down = -1.
// Works when the pointer is over the field, even without clicking it. The panel does not scroll meanwhile,
// and for the seconds field (type="number") Chrome's own wheel stepping is switched off, so it does not step twice.
function handleWheelStep(event, step) {
  event.preventDefault();

  // Horizontal scrolling (touchpad, tilting the wheel) does not change the value.
  if (event.deltaY !== 0) {
    step(event.deltaY < 0 ? 1 : -1);
  }
}

function getStoredTabId() {
  const storedTabId = storage.getCheckedTabId();
  const hasStoredTab = Array.from(elements.tabHeaders).some(tabHeader => tabHeader.id === storedTabId);

  return hasStoredTab ? storedTabId : storage.DEFAULT_CHECKED_TAB_ID;
}

function activateTab(tabId) {
  elements.tabContents.forEach(tabContent => {
    tabContent.style.display = 'none';
  });

  elements.tabHeaders.forEach(tabHeader => {
    const isActiveTab = tabHeader.id === tabId;
    tabHeader.classList.toggle('active', isActiveTab);
  });

  const activeTabContent = elements.tabContentsById.get(tabId);

  if (!activeTabContent) {
    return;
  }

  activeTabContent.style.display = 'block';
  appState.checkedTabId = tabId;
  storage.setCheckedTabId(tabId);
}

function getTabIdForContent(tabContent) {
  return Array.from(tabContent.classList).find(className => className !== 'tab-content');
}

function renderVersion() {
  const versionElement = document.getElementById('version');
  const manifestData = chrome.runtime.getManifest();
  versionElement.textContent = 'v. ' + manifestData.version;
}

