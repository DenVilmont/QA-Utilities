// "Auto-reload page" (Tools tab): the side panel part — buttons and the list of running timers.
// The timers run in the service worker (scripts/reload-timer-service.js),
// so they keep working in several tabs at once and with the panel closed.

import {t} from './languages.js';
import * as storage from './storage.js';
import {getErrorText, setStatus} from './tab3.js';
import {assertSupportedPage, ensureSiteAccess, getActiveTab} from './tab-access.js';
import {
  PRESET_SECONDS,
  RELOAD_TIMERS_STORAGE_KEY,
  RELOAD_TIMER_MESSAGES,
  formatDuration,
  isValidIntervalSeconds
} from './reload-timer-shared.js';

let timers = {};
let panelWindowId = null;
let activeTabId = null;
let countdownIntervalId = null;
const tabTitles = new Map();

function getElement(id) {
  return document.getElementById(id);
}

async function sendToService(type, payload) {
  const response = await chrome.runtime.sendMessage({type, ...payload});

  if (!response?.ok) {
    throw new Error(response?.error ?? '');
  }
}

async function runAction(work) {
  setStatus('');

  try {
    await work();
  } catch (error) {
    setStatus(getErrorText(error), true);
  }
}

// Must be called synchronously from the click / Enter handler: see ensureSiteAccess.
function startTimerForActiveTab(seconds) {
  const accessRequest = ensureSiteAccess(() => setStatus(t('allowSiteAccess')));

  return runAction(async () => {
    await accessRequest;
    const tab = await getActiveTab();
    assertSupportedPage(tab);
    await sendToService(RELOAD_TIMER_MESSAGES.start, {tabId: tab.id, seconds});
  });
}

function stopTimer(tabId) {
  return runAction(() => sendToService(RELOAD_TIMER_MESSAGES.stop, {tabId}));
}

async function goToTab(tabId) {
  const tab = await chrome.tabs.update(tabId, {active: true});
  await chrome.windows.update(tab.windowId, {focused: true});
}

function getRemainingText(timer) {
  const remainingSeconds = (timer.nextReloadAt - Date.now()) / 1000;
  return timer.reloadStartedAt !== null || remainingSeconds <= 0
    ? t('autoReloadReloading')
    : formatDuration(remainingSeconds);
}

function createTimerItem(tabId, timer) {
  const item = document.createElement('div');
  item.className = 'reload-timer-item';
  item.classList.toggle('current', tabId === activeTabId);
  item.dataset.tabId = String(tabId);

  const tabButton = document.createElement('button');
  tabButton.type = 'button';
  tabButton.className = 'reload-timer-tab';
  tabButton.dataset.action = 'goToTab';
  tabButton.title = t('autoReloadGoToTab');
  tabButton.textContent = tabTitles.get(tabId) || `#${tabId}`;

  const intervalText = document.createElement('span');
  intervalText.className = 'reload-timer-interval';
  intervalText.textContent = t('autoReloadInterval').replace('$1', formatDuration(timer.intervalMs / 1000));

  const remainingText = document.createElement('span');
  remainingText.className = 'reload-timer-remaining';
  remainingText.textContent = getRemainingText(timer);

  const stopButton = document.createElement('button');
  stopButton.type = 'button';
  stopButton.className = 'reload-timer-remove';
  stopButton.dataset.action = 'stop';
  stopButton.title = t('autoReloadStopTab');
  stopButton.textContent = '✕';

  item.append(tabButton, intervalText, remainingText, stopButton);
  return item;
}

function updateCountdowns() {
  getElement('reloadTimerList').querySelectorAll('.reload-timer-item').forEach(item => {
    const timer = timers[item.dataset.tabId];

    if (timer) {
      item.querySelector('.reload-timer-remaining').textContent = getRemainingText(timer);
    }
  });
}

function updateCountdownTicker(hasTimers) {
  if (hasTimers && countdownIntervalId === null) {
    countdownIntervalId = setInterval(updateCountdowns, 1000);
  } else if (!hasTimers && countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

function renderControls() {
  const currentTimer = activeTabId === null ? null : timers[activeTabId];
  const currentSeconds = currentTimer ? currentTimer.intervalMs / 1000 : null;
  const isCustomInterval = currentSeconds !== null && !PRESET_SECONDS.includes(currentSeconds);
  const secondsInput = getElement('reloadTimerSeconds');

  getElement('reloadTimerPresets').querySelectorAll('[data-seconds]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.seconds) === currentSeconds);
  });

  secondsInput.classList.toggle('active', isCustomInterval);

  if (isCustomInterval && document.activeElement !== secondsInput) {
    secondsInput.value = String(currentSeconds);
  }

  getElement('reloadTimerStopButton').disabled = !currentTimer;
}

function renderList() {
  const tabIds = Object.keys(timers).map(Number);
  const list = getElement('reloadTimerList');
  list.replaceChildren(...tabIds.map(tabId => createTimerItem(tabId, timers[tabId])));
  updateCountdownTicker(tabIds.length > 0);
}

export function refreshReloadTimerView() {
  renderControls();
  renderList();
}

async function loadTabTitles() {
  await Promise.all(Object.keys(timers).map(Number).map(async tabId => {
    try {
      const tab = await chrome.tabs.get(tabId);
      tabTitles.set(tabId, tab.title || tab.url || '');
    } catch {
      tabTitles.delete(tabId);
    }
  }));
}

async function applyTimers(nextTimers) {
  timers = nextTimers ?? {};
  await loadTabTitles();
  refreshReloadTimerView();
}

export async function initReloadTimer() {
  getElement('reloadTimerSeconds').value = storage.getReloadTimerSeconds();
  panelWindowId = (await chrome.windows.getCurrent()).id;

  chrome.storage.session.onChanged.addListener(changes => {
    if (RELOAD_TIMERS_STORAGE_KEY in changes) {
      void applyTimers(changes[RELOAD_TIMERS_STORAGE_KEY].newValue);
    }
  });

  chrome.tabs.onActivated.addListener(({tabId, windowId}) => {
    if (windowId === panelWindowId) {
      activeTabId = tabId;
      refreshReloadTimerView();
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.title !== undefined && timers[tabId]) {
      tabTitles.set(tabId, changeInfo.title);
      renderList();
    }
  });

  const [activeTab] = await chrome.tabs.query({active: true, windowId: panelWindowId});
  activeTabId = activeTab?.id ?? null;
  const data = await chrome.storage.session.get(RELOAD_TIMERS_STORAGE_KEY);
  await applyTimers(data[RELOAD_TIMERS_STORAGE_KEY]);
}

export function handlePresetClick(event) {
  const presetButton = event.target.closest('[data-seconds]');

  if (presetButton) {
    void startTimerForActiveTab(Number(presetButton.dataset.seconds));
  }
}

export function startCustomTimer() {
  const secondsInput = getElement('reloadTimerSeconds');
  const value = secondsInput.value.trim();
  const seconds = Number(value);

  if (!/^\d+$/.test(value) || !isValidIntervalSeconds(seconds)) {
    setStatus(t('autoReloadInvalidSeconds'), true);
    secondsInput.focus();
    return;
  }

  storage.setReloadTimerSeconds(value);
  void startTimerForActiveTab(seconds);
}

export function stopActiveTabTimer() {
  if (activeTabId !== null) {
    void stopTimer(activeTabId);
  }
}

export function handleTimerListClick(event) {
  const button = event.target.closest('[data-action]');
  const tabId = Number(button?.closest('.reload-timer-item')?.dataset.tabId);

  if (!button || !Number.isInteger(tabId)) {
    return;
  }

  if (button.dataset.action === 'stop') {
    void stopTimer(tabId);
  } else if (button.dataset.action === 'goToTab') {
    void runAction(() => goToTab(tabId));
  }
}
