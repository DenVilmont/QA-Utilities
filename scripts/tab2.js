import {applyTranslations, t} from './languages.js';
import {copyTextToClipboard} from './clipboard.js';
import {getNotebookContent, getSavedValues, setNotebookContent, setSavedValues} from './storage.js';

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
    return Array.isArray(values)
        ? values
            .map(normalizeSavedValue)
            .filter(value => value !== '')
        : [];
}

function readSavedValuesState() {
    return normalizeSavedValues(getSavedValues());
}

function persistSavedValues(savedValues) {
    setSavedValues(savedValues);
    return savedValues;
}

function renderSavedValues(savedValues = readSavedValuesState()) {
    const savedValuesContainer = getSavedValuesContainer();
    const fragment = document.createDocumentFragment();

    savedValuesContainer.setAttribute('role', 'list');

    savedValues.forEach((value, index) => {
        fragment.appendChild(createSavedValueItem(value, index));
    });

    savedValuesContainer.replaceChildren(fragment);
    applyTranslations(savedValuesContainer);
}

function persistAndRenderSavedValues(savedValues) {
    const nextSavedValues = persistSavedValues(savedValues);
    renderSavedValues(nextSavedValues);
    return nextSavedValues;
}

function syncSavedValuesState() {
    const storedValues = getSavedValues();
    const normalizedValues = normalizeSavedValues(storedValues);

    if (storedValues.length !== normalizedValues.length ||
        storedValues.some((value, index) => value !== normalizedValues[index])) {
        persistSavedValues(normalizedValues);
    }

    return normalizedValues;
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
    copyBtn.setAttribute('aria-label', t('copy'));
    copyBtn.innerHTML = '&#x1f5d0;';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('data-action', 'delete-value');
    deleteBtn.setAttribute('data-i18n-title', 'delete');
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
    const savedValues = readSavedValuesState();
    const value = savedValues[index];

    if (typeof value !== 'string') {
        return;
    }

    copyTextToClipboard(value);
}

function deleteSavedValue(index) {
    const savedValues = readSavedValuesState();

    if (index < 0 || index >= savedValues.length) {
        return;
    }

    const nextSavedValues = savedValues.filter((_, savedValueIndex) => savedValueIndex !== index);
    persistAndRenderSavedValues(nextSavedValues);
}

export function saveValue() {
    const normalizedValue = normalizeSavedValue(getValueInput().value);
    const savedValues = readSavedValuesState();

    if (normalizedValue === '') {
        focusAndResetValueInput();
        return;
    }

    const duplicateIndex = findSavedValueIndex(savedValues, normalizedValue);

    if (duplicateIndex !== -1) {
        flashExistingValue(duplicateIndex);
        focusAndResetValueInput();
        return;
    }

    persistAndRenderSavedValues([...savedValues, normalizedValue]);
    focusAndResetValueInput();
}

export function handleSavedValueClick(event) {
    const actionElement = event.target.closest('[data-action]');
    const savedValueItem = actionElement?.closest('[data-saved-value-index]');

    if (!actionElement || !savedValueItem || !getSavedValuesContainer().contains(savedValueItem)) {
        return;
    }

    const index = Number.parseInt(savedValueItem.getAttribute('data-saved-value-index'), 10);

    if (!Number.isInteger(index)) {
        return;
    }

    if (actionElement.getAttribute('data-action') === 'delete-value') {
        deleteSavedValue(index);
        return;
    }

    if (actionElement.getAttribute('data-action') === 'copy-value') {
        copySavedValue(index);
    }
}

export function loadSavedValues() {
    const savedValues = syncSavedValuesState();
    renderSavedValues(savedValues);
}

export function saveNotebookContent() {
    const notebookContent = getNotebookElement().value;
    setNotebookContent(notebookContent);
}

export function clearNotebook() {
    getNotebookElement().value = '';
    setNotebookContent('');
}

export function loadNotebookContent() {
    getNotebookElement().value = getNotebookContent();
}
