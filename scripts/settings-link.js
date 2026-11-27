// Opens the test data page (pages/test-data.html) on the needed part:
//   groups       - test data groups (gear of the "Test data" card, Utilities tab)
//   saved-values - saved values (gear of the "Saved values" card, Notes tab)
// One settings tab is enough: if it is already open, it is shown and switched to that part
// (only the "#..." of its address changes, so the page is not reloaded).

import {showError} from './notify.js';

const SETTINGS_PAGE = 'pages/test-data.html';

export const SETTINGS_SECTIONS = Object.freeze({groups: 'groups', savedValues: 'saved-values'});

export async function openSettingsPage(section) {
  const pageUrl = chrome.runtime.getURL(SETTINGS_PAGE);
  const url = `${pageUrl}#${section}`;

  try {
    const contexts = await chrome.runtime.getContexts({contextTypes: ['TAB']});
    const openPage = contexts.find(context => context.tabId >= 0 && context.documentUrl?.startsWith(pageUrl));

    if (openPage) {
      await chrome.tabs.update(openPage.tabId, {url, active: true});
      await chrome.windows.update(openPage.windowId, {focused: true});
      return;
    }

    await chrome.tabs.create({url});
  } catch (error) {
    showError(error);
  }
}
