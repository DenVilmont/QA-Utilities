// "Auto-reload page" (Tools tab): the service worker part, where the timers actually run.
//
// How it works:
// - The timers are kept in chrome.storage.session, one per tab (see reload-timer-shared.js).
//   The side panel is only a remote control: closing it does not stop the timers.
// - A small script in the page (scripts/page/reload-timer-tick.js) sends a "tick" every second.
//   A message wakes the service worker up; on its own it falls asleep after ~30 s and loses
//   any setTimeout, so it cannot count short intervals by itself.
//   On every tick: update the countdown on the extension icon, reload the tab when it is time.
// - chrome.alarms is a backup for intervals of 30 s and more: Chrome slows down timers
//   in background tabs (up to once a minute), alarms fire on time. They cannot be shorter than 30 s.
// - After our own reload the page script is injected again and the countdown starts over.
//   Any other reload or navigation (F5, a link, the address bar) replaces the page without our
//   script, and the timer is removed. Navigation inside a single-page app (Angular router)
//   keeps the same page and script, so the timer stays.

import {
  RELOAD_TIMERS_STORAGE_KEY,
  RELOAD_TIMER_MESSAGES,
  isValidIntervalSeconds
} from './reload-timer-shared.js';

const PAGE_SCRIPT_FILE = '/scripts/page/reload-timer-tick.js';
const ALARM_PREFIX = 'reloadTimer:';
const MIN_ALARM_DELAY_MS = 30 * 1000;
// If the old page still sends ticks this long after our reload started, the reload did not happen
// (for example, the user chose "Stay" in the "Leave site?" dialog). The timer is then removed.
const RELOAD_CANCEL_TIMEOUT_MS = 30 * 1000;
// A page that does not answer in time (for example, frozen in a background tab) is treated as alive:
// the reload wakes it up anyway.
const PAGE_CHECK_TIMEOUT_MS = 3000;
const BADGE_BACKGROUND_COLOR = '#b36531';
const BADGE_TEXT_COLOR = '#ffffff';

// Ticks of several tabs, alarms and tab events read and change the same object in storage,
// so they run one after another.
let queue = Promise.resolve();

function runInQueue(task) {
  const result = queue.then(task);
  queue = result.catch(error => console.error('Auto-reload task failed.', error));
  return result;
}

async function getTimers() {
  const data = await chrome.storage.session.get(RELOAD_TIMERS_STORAGE_KEY);
  return data[RELOAD_TIMERS_STORAGE_KEY] ?? {};
}

function saveTimers(timers) {
  return chrome.storage.session.set({[RELOAD_TIMERS_STORAGE_KEY]: timers});
}

function getAlarmName(tabId) {
  return ALARM_PREFIX + tabId;
}

async function scheduleAlarm(tabId, timer) {
  await chrome.alarms.clear(getAlarmName(tabId));

  if (timer.intervalMs >= MIN_ALARM_DELAY_MS) {
    await chrome.alarms.create(getAlarmName(tabId), {when: timer.nextReloadAt});
  }
}

// The badge has room for about 4 characters: "45s", "12m", "3h".
function formatBadge(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (seconds < 100) {
    return `${seconds}s`;
  }

  const minutes = Math.ceil(seconds / 60);
  return minutes < 100 ? `${minutes}m` : `${Math.ceil(minutes / 60)}h`;
}

function setBadge(tabId, text) {
  // The tab may already be closed.
  return chrome.action.setBadgeText({tabId, text}).catch(() => {});
}

function injectPageScript(tabId) {
  return chrome.scripting.executeScript({target: {tabId}, files: [PAGE_SCRIPT_FILE]});
}

// true if our page script still runs in the document open in the tab, that is, the page was not replaced.
async function isPageScriptRunning(tabId) {
  const check = chrome.scripting.executeScript({
    target: {tabId},
    func: () => globalThis.qaUtilitiesReloadTimer === true
  }).then(([frameResult]) => frameResult?.result === true, () => false);
  const timeout = new Promise(resolve => setTimeout(() => resolve(true), PAGE_CHECK_TIMEOUT_MS));

  return Promise.race([check, timeout]);
}

async function removeTimer(tabId) {
  const timers = await getTimers();

  if (timers[tabId]) {
    delete timers[tabId];
    await saveTimers(timers);
  }

  await chrome.alarms.clear(getAlarmName(tabId));
  await setBadge(tabId, '');
}

async function startTimer(tabId, seconds) {
  if (!Number.isInteger(tabId) || !isValidIntervalSeconds(seconds)) {
    throw new Error(`Invalid timer: tab ${tabId}, ${seconds} s`);
  }

  await injectPageScript(tabId);

  const intervalMs = seconds * 1000;
  const timer = {intervalMs, nextReloadAt: Date.now() + intervalMs, reloadStartedAt: null};
  const timers = await getTimers();
  timers[tabId] = timer;
  await saveTimers(timers);
  await scheduleAlarm(tabId, timer);
  await setBadge(tabId, formatBadge(intervalMs));
}

async function reloadTab(tabId, timers) {
  timers[tabId].reloadStartedAt = Date.now();
  await saveTimers(timers);
  await chrome.alarms.clear(getAlarmName(tabId));

  // Not awaited: with a "Leave site?" dialog the reload may wait for the user.
  chrome.tabs.reload(tabId).catch(() => runInQueue(() => removeTimer(tabId)));
}

// Returns {stop: true} when the page script must stop ticking.
async function handleTick(tabId) {
  const timers = await getTimers();
  const timer = timers[tabId];

  if (!timer) {
    return {stop: true};
  }

  if (timer.reloadStartedAt !== null) {
    if (Date.now() - timer.reloadStartedAt > RELOAD_CANCEL_TIMEOUT_MS) {
      await removeTimer(tabId);
      return {stop: true};
    }

    return {};
  }

  const remainingMs = timer.nextReloadAt - Date.now();

  if (remainingMs <= 0) {
    await reloadTab(tabId, timers);
  } else {
    await setBadge(tabId, formatBadge(remainingMs));
  }

  return {};
}

async function handleAlarm(alarm) {
  if (!alarm.name.startsWith(ALARM_PREFIX)) {
    return;
  }

  const tabId = Number(alarm.name.slice(ALARM_PREFIX.length));
  const timers = await getTimers();
  const timer = timers[tabId];

  if (!timer || timer.reloadStartedAt !== null) {
    return;
  }

  if (!(await isPageScriptRunning(tabId))) {
    await removeTimer(tabId);
    return;
  }

  // The timer was restarted after the alarm had been created.
  if (timer.nextReloadAt - Date.now() > 1000) {
    await scheduleAlarm(tabId, timer);
    return;
  }

  await reloadTab(tabId, timers);
}

async function handlePageLoaded(tabId) {
  const timers = await getTimers();
  const timer = timers[tabId];

  if (!timer) {
    return;
  }

  if (timer.reloadStartedAt === null) {
    // Not our reload: the same page (navigation inside a single-page app) keeps the timer,
    // a new page (F5, a link, the address bar) removes it.
    if (!(await isPageScriptRunning(tabId))) {
      await removeTimer(tabId);
    }

    return;
  }

  // Our reload has finished: count again on the new page.
  timer.reloadStartedAt = null;
  timer.nextReloadAt = Date.now() + timer.intervalMs;
  await saveTimers(timers);

  try {
    await injectPageScript(tabId);
  } catch {
    // The page cannot be scripted any more (for example, Chrome's "This site can't be reached").
    await removeTimer(tabId);
    return;
  }

  await scheduleAlarm(tabId, timer);
  await setBadge(tabId, formatBadge(timer.intervalMs));
}

function respond(promise, sendResponse) {
  promise.then(
    result => sendResponse({ok: true, ...result}),
    error => sendResponse({ok: false, error: error?.message ?? String(error)})
  );
}

function handleMessage(message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  switch (message?.type) {
    case RELOAD_TIMER_MESSAGES.tick: {
      const tabId = sender.tab?.id;

      if (tabId === undefined || sender.frameId !== 0) {
        return false;
      }

      respond(runInQueue(() => handleTick(tabId)), sendResponse);
      return true;
    }
    case RELOAD_TIMER_MESSAGES.start:
      respond(runInQueue(() => startTimer(message.tabId, message.seconds)), sendResponse);
      return true;
    case RELOAD_TIMER_MESSAGES.stop:
      respond(runInQueue(() => removeTimer(message.tabId)), sendResponse);
      return true;
    default:
      return false;
  }
}

// Must be called at the top level of the service worker, so the listeners exist when Chrome wakes it up.
export function registerReloadTimerService() {
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.alarms.onAlarm.addListener(alarm => void runInQueue(() => handleAlarm(alarm)));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      void runInQueue(() => handlePageLoaded(tabId));
    }
  });
  chrome.tabs.onRemoved.addListener(tabId => void runInQueue(() => removeTimer(tabId)));
  // Chrome may swap a tab for a preloaded one: the old tab id disappears.
  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => void runInQueue(() => removeTimer(removedTabId)));

  void chrome.action.setBadgeBackgroundColor({color: BADGE_BACKGROUND_COLOR});
  void chrome.action.setBadgeTextColor({color: BADGE_TEXT_COLOR});
}
