// Test data: groups of ready-made values (emails, numbers, XSS...) to copy in one click.
// Shown at the bottom of the "Utilities" tab, edited on the test data page (pages/test-data.html).
//
// Model: group -> sections -> values.
//   group   {name, sections: [section]}
//   section {name, values: [value]}  - a section with an empty name has no header (a group without subgroups)
//   value   {label, value}           - label is optional, value is copied exactly as it is (spaces included)
//
// The export file also has the saved values of the Notes tab (they are edited on the same page).

import {DEFAULT_TEST_DATA_GROUPS} from './test-data-defaults.js';
import {getStoredTestData, normalizeSavedValues, removeStoredTestData, setStoredTestData} from './storage.js';
import {t} from './languages.js';

const STORAGE_VERSION = 1;
const EXPORT_FORMAT = 'qa-utilities-test-data';
export const EXPORT_FILE_NAME = 'qa-utilities-test-data.json';

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeValue(value) {
  // A bare string is accepted too, it is shorter to write by hand in a JSON file.
  if (typeof value === 'string') {
    return {label: '', value};
  }

  return {label: asString(value?.label).trim(), value: asString(value?.value)};
}

function normalizeSection(section) {
  return {
    name: asString(section?.name).trim(),
    values: asArray(section?.values).map(normalizeValue)
  };
}

function normalizeGroup(group) {
  return {
    name: asString(group?.name).trim(),
    sections: asArray(group?.sections).map(normalizeSection)
  };
}

// Always returns a fresh copy with the right structure; wrong parts become empty strings or empty lists.
export function normalizeGroups(groups) {
  return asArray(groups).filter(group => group && typeof group === 'object').map(normalizeGroup);
}

// Name shown in lists; a group may have an empty name while it is being edited.
export function getGroupTitle(group) {
  return group.name || t('testDataUntitledGroup');
}

export function getDefaultGroups() {
  return normalizeGroups(DEFAULT_TEST_DATA_GROUPS);
}

export function loadGroups() {
  const stored = getStoredTestData();
  return stored === null ? getDefaultGroups() : normalizeGroups(stored.groups);
}

// Returns false if the data could not be saved (the storage is full).
export function saveGroups(groups) {
  return setStoredTestData({version: STORAGE_VERSION, groups: normalizeGroups(groups)});
}

export function resetGroups() {
  removeStoredTestData();
  return getDefaultGroups();
}

// The file has the test data groups and the saved values (Notes tab).
export function createExportText(groups, savedValues) {
  return JSON.stringify({
    format: EXPORT_FORMAT,
    version: STORAGE_VERSION,
    groups: normalizeGroups(groups),
    savedValues: normalizeSavedValues(savedValues)
  }, null, 2);
}

// Accepts an exported file ({format, version, groups, savedValues}) or just the list of groups.
// Returns {groups, savedValues}: null for a part the file does not have (that part is not replaced);
// null instead of the object if the text is not JSON or has neither part.
export function parseImportText(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const groups = normalizeGroups(Array.isArray(parsed) ? parsed : parsed?.groups);
  const savedValues = Array.isArray(parsed?.savedValues) ? normalizeSavedValues(parsed.savedValues) : null;

  if (groups.length === 0 && savedValues === null) {
    return null;
  }

  return {groups: groups.length > 0 ? groups : null, savedValues};
}
