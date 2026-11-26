// Injected into the page by "Auto-reload page" (scripts/reload-timer-service.js).
// Sends a "tick" to the service worker every second; the service worker decides when to reload.
// The script lives as long as the page does: after F5 or opening another page in the tab
// it is gone, and that is how the service worker knows the timer must be removed.
(() => {
  if (globalThis.qaUtilitiesReloadTimer === true) {
    return;
  }

  globalThis.qaUtilitiesReloadTimer = true;

  // RELOAD_TIMER_MESSAGES.tick in scripts/reload-timer-shared.js (a page script cannot import it).
  const TICK_MESSAGE = 'reloadTimer:tick';
  let intervalId = null;

  function stop() {
    clearInterval(intervalId);
    globalThis.qaUtilitiesReloadTimer = false;
  }

  function tick() {
    try {
      chrome.runtime.sendMessage({type: TICK_MESSAGE}).then(
        response => {
          if (response?.stop) {
            stop();
          }
        },
        () => {}
      );
    } catch {
      // The extension was reloaded or updated: this copy of the script can no longer reach it.
      stop();
    }
  }

  intervalId = setInterval(tick, 1000);
})();
