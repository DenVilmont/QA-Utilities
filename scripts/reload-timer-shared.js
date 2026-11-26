// "Auto-reload page" (Tools tab): values shared by the side panel and the service worker.

// chrome.storage.session: {[tabId]: {intervalMs, nextReloadAt, reloadStartedAt}}.
// reloadStartedAt is the time our own reload started, or null when no reload is in progress.
export const RELOAD_TIMERS_STORAGE_KEY = 'reloadTimers';

export const RELOAD_TIMER_MESSAGES = Object.freeze({
  start: 'reloadTimer:start',
  stop: 'reloadTimer:stop',
  // Sent every second by scripts/page/reload-timer-tick.js (the same text is written there).
  tick: 'reloadTimer:tick'
});

export const PRESET_SECONDS = Object.freeze([5, 10, 30, 60]);
export const MIN_INTERVAL_SECONDS = 1;
export const MAX_INTERVAL_SECONDS = 86400;

export function isValidIntervalSeconds(seconds) {
  return Number.isInteger(seconds) && seconds >= MIN_INTERVAL_SECONDS && seconds <= MAX_INTERVAL_SECONDS;
}
