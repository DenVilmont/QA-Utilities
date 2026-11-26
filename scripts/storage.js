export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_CHECKED_TAB_ID = 'tab1';
export const DEFAULT_SAVED_VALUES = Object.freeze([]);
export const DEFAULT_NOTEBOOK_CONTENT = '';

const STORAGE_KEYS = Object.freeze({
  language: 'language',
  checkedTabId: 'checkedTabId',
  savedValues: 'savedValues',
  notebookContent: 'notebookContent',
  screenshotEditorSettings: 'screenshotEditorSettings',
  reloadTimerSeconds: 'reloadTimerSeconds',
  gifScale: 'gifScale'
});

function getStoredString(key, fallbackValue) {
  return localStorage.getItem(key) || fallbackValue;
}

// Returns false if the value could not be saved (for example, the storage quota is exceeded).
function setStoredString(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to save "${key}" to localStorage.`, error);
    return false;
  }
}

function parseSavedValues(rawValue) {
  if (!rawValue) {
    return [...DEFAULT_SAVED_VALUES];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [...DEFAULT_SAVED_VALUES];
  } catch {
    return [...DEFAULT_SAVED_VALUES];
  }
}

export function getLanguage() {
  return getStoredString(STORAGE_KEYS.language, DEFAULT_LANGUAGE);
}

export function setLanguage(language) {
  return setStoredString(STORAGE_KEYS.language, language);
}

export function getCheckedTabId() {
  return getStoredString(STORAGE_KEYS.checkedTabId, DEFAULT_CHECKED_TAB_ID);
}

export function setCheckedTabId(tabId) {
  return setStoredString(STORAGE_KEYS.checkedTabId, tabId);
}

export function getSavedValues() {
  return parseSavedValues(localStorage.getItem(STORAGE_KEYS.savedValues));
}

export function setSavedValues(values) {
  const nextValues = Array.isArray(values) ? values : [...DEFAULT_SAVED_VALUES];
  return setStoredString(STORAGE_KEYS.savedValues, JSON.stringify(nextValues));
}

export function getNotebookContent() {
  return getStoredString(STORAGE_KEYS.notebookContent, DEFAULT_NOTEBOOK_CONTENT);
}

export function setNotebookContent(content) {
  return setStoredString(STORAGE_KEYS.notebookContent, content ?? DEFAULT_NOTEBOOK_CONTENT);
}

// Keys that other open panels (other Chrome windows) may change.
export const SYNCED_STORAGE_KEYS = Object.freeze({
  savedValues: STORAGE_KEYS.savedValues,
  notebookContent: STORAGE_KEYS.notebookContent
});

// Last used tool, colour and line thickness in the screenshot editor.
// Returns an empty object if nothing was saved yet; the editor validates the values.
export function getScreenshotEditorSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.screenshotEditorSettings));
    return settings && typeof settings === 'object' ? settings : {};
  } catch {
    return {};
  }
}

export function setScreenshotEditorSettings(settings) {
  return setStoredString(STORAGE_KEYS.screenshotEditorSettings, JSON.stringify(settings));
}

// Last custom interval (in seconds) of "Auto-reload page"; an empty string if none was entered yet.
export function getReloadTimerSeconds() {
  return getStoredString(STORAGE_KEYS.reloadTimerSeconds, '');
}

export function setReloadTimerSeconds(seconds) {
  return setStoredString(STORAGE_KEYS.reloadTimerSeconds, String(seconds));
}

// GIF size chosen last time in the recording tab (1, 0.75 or 0.5); null if never chosen.
export function getGifScale() {
  const value = Number.parseFloat(localStorage.getItem(STORAGE_KEYS.gifScale));
  return Number.isFinite(value) ? value : null;
}

export function setGifScale(scale) {
  return setStoredString(STORAGE_KEYS.gifScale, String(scale));
}
