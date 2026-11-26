// Shared helpers for tools that work with the page open in the active tab
// (screenshots, clearing site data): permissions, active tab, unsupported pages.

const ALL_SITES = Object.freeze({origins: ['<all_urls>']});
const RESTRICTED_PROTOCOLS = ['chrome:', 'chrome-extension:', 'chrome-untrusted:', 'edge:', 'about:', 'devtools:', 'view-source:'];
const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

// Error with a translation key, so the side panel can show a localized message.
export class ToolError extends Error {
  constructor(messageKey, details = '') {
    super(details || messageKey);
    this.messageKey = messageKey;
    this.details = details;
  }
}

// If the user set "Site access: On click / On specific sites" in chrome://extensions,
// Chrome withholds the host permission: no tab URL, no screenshots, no access to the page.
// Asking again shows Chrome's permission prompt; after "Allow" it is remembered.
//
// IMPORTANT: this function must be called synchronously from the click handler, before any "await".
// Chrome shows the prompt only while it still treats the call as a user action;
// after an "await" it refuses silently. If access is already granted, Chrome resolves
// the request immediately without showing anything.
export function ensureSiteAccess(onPrompt = () => {}) {
  let requestPromise;

  try {
    requestPromise = chrome.permissions.request(ALL_SITES);
  } catch (error) {
    return Promise.reject(new ToolError('noSiteAccess', error?.message));
  }

  chrome.permissions.contains(ALL_SITES).then(hasAccess => {
    if (!hasAccess) {
      onPrompt();
    }
  });

  return requestPromise.then(
    isGranted => {
      if (!isGranted) {
        throw new ToolError('noSiteAccess');
      }
    },
    error => {
      throw new ToolError('noSiteAccess', error?.message);
    }
  );
}

export async function getActiveTab() {
  const currentWindow = await chrome.windows.getCurrent();
  const [tab] = await chrome.tabs.query({active: true, windowId: currentWindow.id});

  if (!tab) {
    throw new ToolError('noActiveTab');
  }

  return tab;
}

function isRestrictedUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return RESTRICTED_PROTOCOLS.includes(parsedUrl.protocol) || RESTRICTED_HOSTS.includes(parsedUrl.hostname);
  } catch {
    return true;
  }
}

// Browser pages, the Web Store and extension pages cannot be scripted or captured.
export function assertSupportedPage(tab) {
  if (!tab.url || isRestrictedUrl(tab.url)) {
    throw new ToolError('pageRestricted');
  }
}
