import {copyToClipboard} from './utils.js';
import {applyTranslations} from './languages.js';
import {getNotebookContent, getSavedValues, setNotebookContent, setSavedValues} from './storage.js';

export function saveValue() {
    const inputValue = document.getElementById('valueInput').value;
    if (inputValue.trim() !== "") {
        const savedValues = getSavedValues();
        if (!savedValues.includes(inputValue)) {
            savedValues.push(inputValue);
            setSavedValues(savedValues);
            addValueToDOM(inputValue);
        } else {
            flashExistingValue(inputValue);
        }
    }
    document.getElementById('valueInput').value = '';
    document.getElementById('valueInput').focus();
}

function flashExistingValue(value) {
    const elements = document.querySelectorAll('.saved-value');
    elements.forEach(el => {
        if (el.textContent === value) {
            el.classList.add('flash');
            setTimeout(() => {
                el.classList.remove('flash');
            }, 1000);
        }
    });
}

export function handleValueClick(event) {
    const target = event.target;
    if (target.classList.contains('copy-btn')) {
        copyToClipboard(target.parentElement.querySelector('.saved-value').textContent);
    } else if (target.classList.contains('delete-btn')) {
        deleteValue(target.parentElement.querySelector('.saved-value').textContent);
    } else if (target.classList.contains('saved-value')) {
        copyToClipboard(target.textContent);
    }
}

function deleteValue(value) {
    const savedValues = getSavedValues().filter(item => item !== value);
    setSavedValues(savedValues);
    displaySavedValues();
}

function createSavedValueItem(value) {
    const container = document.createElement('div');
    container.className = 'saved-value-container';

    const saved = document.createElement('div');
    saved.className = 'saved-value';
    saved.textContent = value;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.setAttribute('data-i18n-title', 'copy');
    copyBtn.innerHTML = '&#x1f5d0;';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('data-i18n-title', 'delete');
    deleteBtn.innerHTML = '&#x26cc;';

    container.append(saved, copyBtn, deleteBtn);
    return container;
}

function addValueToDOM(value) {
    const el = createSavedValueItem(value);
    document.getElementById('savedValues').appendChild(el);
    applyTranslations(el);
}

export function displaySavedValues() {
    const savedValuesContainer = document.getElementById('savedValues');
    savedValuesContainer.innerHTML = '';
    getSavedValues().forEach(value => {
        addValueToDOM(value);
    });
}

export function saveNotebookContent() {
    const notebookContent = document.getElementById('notebook').value;
    saveNotebookText(notebookContent);
}

export function saveNotebookText(text) {
    setNotebookContent(text);
}

export function loadNotebookContent() {
    document.getElementById('notebook').value = getNotebookContent();
}
