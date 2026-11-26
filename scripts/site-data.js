// Clears everything the browser stores for the site in the active tab, then reloads the page
// without cache. Used to test login / first visit "from scratch" without an incognito window.

import {ToolError, assertSupportedPage} from './tab-access.js';

// Removed with chrome.browsingData for the exact origins of the site.
// Cookies are NOT removed here: browsingData would delete them for the whole domain
// (for example all *.gestamp.com sites). They are removed separately, more precisely.
const STORAGE_TO_REMOVE = Object.freeze({
  cache: true,
  cacheStorage: true,
  fileSystems: true,
  indexedDB: true,
  localStorage: true,
  serviceWorkers: true
});

// Runs inside the page (every frame): sessionStorage belongs to the tab,
// so chrome.browsingData cannot remove it.
function pageClearSessionStorage() {
  try {
    sessionStorage.clear();
  } catch {
    // Some sandboxed frames do not allow access to sessionStorage.
  }
}

// The same host over http and https: both may have stored data.
function getSiteOrigins(url) {
  const otherProtocol = url.protocol === 'https:' ? 'http:' : 'https:';
  return [`${url.protocol}//${url.host}`, `${otherProtocol}//${url.host}`];
}

// Cookie domain "example.com" / ".example.com" applies to the host itself and to its subdomains.
function isCookieSentToHost(cookie, hostname) {
  const cookieDomain = cookie.domain.replace(/^\./, '').toLowerCase();
  return hostname === cookieDomain || (!cookie.hostOnly && hostname.endsWith(`.${cookieDomain}`));
}

async function getAllCookies() {
  try {
    // An empty partitionKey also returns partitioned cookies (Chrome 119+).
    return await chrome.cookies.getAll({partitionKey: {}});
  } catch {
    return chrome.cookies.getAll({});
  }
}

// Removes the cookies this site receives: its own and the ones of its parent domains
// (for example ".gestamp.com" for ictlocal.gestamp.com), but not the cookies of other subdomains.
async function removeSiteCookies(hostname) {
  const cookies = (await getAllCookies()).filter(cookie => isCookieSentToHost(cookie, hostname));

  await Promise.all(cookies.map(cookie => {
    const details = {
      url: `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name,
      storeId: cookie.storeId
    };

    if (cookie.partitionKey) {
      details.partitionKey = cookie.partitionKey;
    }

    return chrome.cookies.remove(details).catch(() => null);
  }));

  return cookies.length;
}

// Returns the host name of the cleared site.
export async function clearSiteDataAndReload(tab) {
  assertSupportedPage(tab);
  const url = new URL(tab.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolError('pageRestricted');
  }

  await chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    func: pageClearSessionStorage
  }).catch(() => {});

  try {
    await chrome.browsingData.remove({origins: getSiteOrigins(url)}, STORAGE_TO_REMOVE);
    await removeSiteCookies(url.hostname);
  } catch (error) {
    throw new ToolError('siteDataFailed', error?.message);
  }

  await chrome.tabs.reload(tab.id, {bypassCache: true});
  return url.hostname;
}
