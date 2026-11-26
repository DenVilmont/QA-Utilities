// Test data: groups of ready-made values (emails, numbers, XSS...) to copy in one click.
// Shown at the bottom of the "Utilities" tab, edited on the test data page (pages/test-data.html).
//
// Model: group -> sections -> values.
//   group   {name, sections: [section]}
//   section {name, values: [value]}  - a section with an empty name has no header (a group without subgroups)
//   value   {label, value}           - label is optional, value is copied exactly as it is (spaces included)

import {DEFAULT_TEST_DATA_GROUPS} from './test-data-defaults.js';
import {getStoredTestData, removeStoredTestData, setStoredTestData} from './storage.js';
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

export function createExportText(groups) {
  return JSON.stringify({format: EXPORT_FORMAT, version: STORAGE_VERSION, groups: normalizeGroups(groups)}, null, 2);
}

// Accepts an exported file ({format, version, groups}) or just the list of groups.
// Returns null if the text is not JSON or has no groups.
export function parseImportText(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const groups = normalizeGroups(Array.isArray(parsed) ? parsed : parsed?.groups);
  return groups.length > 0 ? groups : null;
}
