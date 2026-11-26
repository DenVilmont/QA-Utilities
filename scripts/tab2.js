import {applyTranslations, t} from './languages.js';
import {copyTextToClipboard} from './clipboard.js';
import {getNotebookContent, getSavedValues, setNotebookContent, setSavedValues} from './storage.js';

let savedValuesState = [];

function getSavedValuesContainer() {
  return document.getElementById('savedValues');
}

function getValueInput() {
  return document.getElementById('valueInput');
}

function getNotebookElement() {
  return document.getElementById('notebook');
}

function normalizeSavedValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSavedValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalizedValues = [];
  const seenValues = new Set();

  values.forEach(value => {
    const normalizedValue = normalizeSavedValue(value);

    if (normalizedValue === '' || seenValues.has(normalizedValue)) {
      return;
    }

    seenValues.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  });

  return normalizedValues;
}

function areSavedValuesEqual(firstValues, secondValues) {
  return Array.isArray(firstValues)
    && Array.isArray(secondValues)
    && firstValues.length === secondValues.length
    && firstValues.every((value, index) => value === secondValues[index]);
}

function setSavedValuesState(savedValues) {
  savedValuesState = normalizeSavedValues(savedValues);
  return savedValuesState;
}

function persistSavedValuesState() {
  setSavedValues(savedValuesState);
  return savedValuesState;
}

function renderSavedValues() {
  const savedValuesContainer = getSavedValuesContainer();
  const fragment = document.createDocumentFragment();

  savedValuesContainer.setAttribute('role', 'list');

  savedValuesState.forEach((value, index) => {
    fragment.appendChild(createSavedValueItem(value, index));
  });

  savedValuesContainer.replaceChildren(fragment);
  applyTranslations(savedValuesContainer);
}

function commitSavedValues(savedValues) {
  setSavedValuesState(savedValues);
  persistSavedValuesState();
  renderSavedValues();
  return savedValuesState;
}

function createSavedValueItem(value, index) {
  const container = document.createElement('div');
  container.className = 'saved-value-container';
  container.setAttribute('data-saved-value-index', String(index));
  container.setAttribute('role', 'listitem');

  const saved = document.createElement('button');
  saved.type = 'button';
  saved.className = 'saved-value';
  saved.setAttribute('data-action', 'copy-value');
  saved.setAttribute('data-i18n-title', 'copy');
  saved.textContent = value;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-btn';
  copyBtn.setAttribute('data-action', 'copy-value');
  copyBtn.setAttribute('data-i18n-title', 'copy');
  copyBtn.setAttribute('data-i18n-aria-label', 'copy');
  copyBtn.setAttribute('aria-label', t('copy'));
  copyBtn.innerHTML = '&#x1f5d0;';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.setAttribute('data-action', 'delete-value');
  deleteBtn.setAttribute('data-i18n-title', 'delete');
  deleteBtn.setAttribute('data-i18n-aria-label', 'delete');
  deleteBtn.setAttribute('aria-label', t('delete'));
  deleteBtn.innerHTML = '&#x26cc;';

  container.append(saved, copyBtn, deleteBtn);
  return container;
}

function flashExistingValue(index) {
  const savedValueElement = getSavedValuesContainer()
    .querySelector(`[data-saved-value-index="${index}"] .saved-value`);

  if (!savedValueElement) {
    return;
  }

  savedValueElement.classList.add('flash');
  setTimeout(() => {
    savedValueElement.classList.remove('flash');
  }, 1000);
}

function focusAndResetValueInput() {
  const valueInput = getValueInput();
  valueInput.value = '';
  valueInput.focus();
}

function findSavedValueIndex(savedValues, candidateValue) {
  return savedValues.findIndex(savedValue => savedValue === candidateValue);
}

function copySavedValue(index) {
  const value = savedValuesState[index];

  if (typeof value !== 'string') {
    return;
  }

  copyTextToClipboard(value);
}

function deleteSavedValue(index) {
  if (index < 0 || index >= savedValuesState.length) {
    return;
  }

  commitSavedValues(savedValuesState.filter((_, savedValueIndex) => savedValueIndex !== index));
}

export function saveValue() {
  const normalizedValue = normalizeSavedValue(getValueInput().value);

  if (normalizedValue === '') {
    focusAndResetValueInput();
    return;
  }

  const duplicateIndex = findSavedValueIndex(savedValuesState, normalizedValue);

  if (duplicateIndex !== -1) {
    flashExistingValue(duplicateIndex);
    focusAndResetValueInput();
    return;
  }

  commitSavedValues([...savedValuesState, normalizedValue]);
  focusAndResetValueInput();
}

export function handleSavedValueClick(event) {
  const savedValuesContainer = getSavedValuesContainer();
  const actionElement = event.target instanceof Element
    ? event.target.closest('[data-action]')
    : null;
  const action = actionElement?.getAttribute('data-action');
  const savedValueItem = actionElement?.closest('[data-saved-value-index]');

  if (!actionElement || !savedValueItem || !savedValuesContainer.contains(actionElement)) {
    return;
  }

  const index = Number.parseInt(savedValueItem.getAttribute('data-saved-value-index'), 10);

  if (!Number.isInteger(index)) {
    return;
  }

  if (action === 'delete-value') {
    deleteSavedValue(index);
    return;
  }

  if (action === 'copy-value') {
    copySavedValue(index);
  }
}

export function loadSavedValues() {
  const storedValues = getSavedValues();
  const normalizedValues = setSavedValuesState(storedValues);

  if (!areSavedValuesEqual(storedValues, normalizedValues)) {
    persistSavedValuesState();
  }

  renderSavedValues();
}

export function refreshSavedValuesView() {
  renderSavedValues();
}

function setNotebookSaveErrorState(hasError) {
  const notebookElement = getNotebookElement();
  notebookElement.classList.toggle('save-error', hasError);

  if (hasError) {
    notebookElement.setAttribute('title', t('NotSavedStorageFull'));
  } else {
    notebookElement.removeAttribute('title');
  }
}

export function saveNotebookContent() {
  const notebookContent = getNotebookElement().value ?? '';
  const isSaved = setNotebookContent(notebookContent);
  setNotebookSaveErrorState(!isSaved);
  return notebookContent;
}

export function clearNotebook() {
  getNotebookElement().value = '';
  saveNotebookContent();
}

export function loadNotebookContent() {
  const notebookElement = getNotebookElement();
  const notebookContent = getNotebookContent();

  // Do not touch the textarea if nothing changed: assigning value resets the cursor position.
  if (notebookElement.value !== notebookContent) {
    notebookElement.value = notebookContent;
  }

  setNotebookSaveErrorState(false);
  return notebookContent;
}
