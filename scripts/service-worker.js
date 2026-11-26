import {registerReloadTimerService} from './reload-timer-service.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true});
});

registerReloadTimerService();
