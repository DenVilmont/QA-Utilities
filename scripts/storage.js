export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_CHECKED_TAB_ID = 'tab1';
export const DEFAULT_SAVED_VALUES = Object.freeze([]);
export const DEFAULT_NOTEBOOK_CONTENT = '';

const STORAGE_KEYS = Object.freeze({
  language: 'language',
  checkedTabId: 'checkedTabId',
  savedValues: 'savedValues',
  notebookContent: 'notebookContent'
});

function getStoredString(key, fallbackValue) {
  return localStorage.getItem(key) || fallbackValue;
}

function setStoredString(key, value) {
  localStorage.setItem(key, value);
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
  setStoredString(STORAGE_KEYS.language, language);
}

export function getCheckedTabId() {
  return getStoredString(STORAGE_KEYS.checkedTabId, DEFAULT_CHECKED_TAB_ID);
}

export function setCheckedTabId(tabId) {
  setStoredString(STORAGE_KEYS.checkedTabId, tabId);
}

export function getSavedValues() {
  return parseSavedValues(localStorage.getItem(STORAGE_KEYS.savedValues));
}

export function setSavedValues(values) {
  const nextValues = Array.isArray(values) ? values : [...DEFAULT_SAVED_VALUES];
  localStorage.setItem(STORAGE_KEYS.savedValues, JSON.stringify(nextValues));
}

export function getNotebookContent() {
  return getStoredString(STORAGE_KEYS.notebookContent, DEFAULT_NOTEBOOK_CONTENT);
}

export function setNotebookContent(content) {
  setStoredString(STORAGE_KEYS.notebookContent, content ?? DEFAULT_NOTEBOOK_CONTENT);
}
