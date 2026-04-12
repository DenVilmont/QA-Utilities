import {copyToClipboard} from './utils.js';

let savedValuesArray = JSON.parse(localStorage.getItem('savedValues')) || [];

export function saveValue() {
    const inputValue = document.getElementById('valueInput').value;
    if (inputValue.trim() !== "") {
        if (!savedValuesArray.includes(inputValue)) {
            savedValuesArray.push(inputValue);
            localStorage.setItem('savedValues', JSON.stringify(savedValuesArray));
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
            }, 1000); // Длительность анимации
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
    savedValuesArray = savedValuesArray.filter(item => item !== value);
    localStorage.setItem('savedValues', JSON.stringify(savedValuesArray));
    displaySavedValues(); // Обновить отображение
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
    copyBtn.innerHTML = '🗐';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('data-i18n-title', 'delete');
    deleteBtn.innerHTML = '⛌';

    container.append(saved, copyBtn, deleteBtn);
    return container;
}

function addValueToDOM(value) {
    const el = createSavedValueItem(value);
    document.getElementById('savedValues').appendChild(el);
}
  
export function displaySavedValues() {
    const savedValuesContainer = document.getElementById('savedValues');
    savedValuesContainer.innerHTML = ''; // Очистить предыдущий контент
    savedValuesArray.forEach(value => {
        addValueToDOM(value);
    });
}

export function saveNotebookContent() {
    const notebookContent = document.getElementById('notebook').value;
    saveNotebookText(notebookContent);
}

export function saveNotebookText(text) {
    localStorage.setItem('notebookContent', text);
}
  
export function loadNotebookContent() {
    const savedContent = localStorage.getItem('notebookContent');
    if (savedContent) {
        document.getElementById('notebook').value = savedContent;
    }
}







