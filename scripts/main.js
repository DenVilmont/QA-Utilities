import * as languages from './languages.js';
import * as utils from './utils.js';
import * as tab1 from './tab1.js';
import * as tab2 from './tab2.js';

const DEFAULT_TAB_ID = 'tab1';
const elements = {};

let appState = {
  checkedTabId: DEFAULT_TAB_ID,
  language: 'en'
};

document.addEventListener('DOMContentLoaded', bootstrapApp);

function bootstrapApp() {
  cacheElements();
  bindEvents();
  loadInitialState();
  renderInitialUI();
  activateInitialTab();
}

function cacheElements() {
  elements.languageSelect = document.getElementById('languageSelect');
  elements.copyTextButtons = document.querySelectorAll('.copyTextButton');
  elements.clearTextButtons = document.querySelectorAll('.clearTextButton');
  elements.tabHeaders = document.querySelectorAll('.tab-header');
  elements.tabContents = document.querySelectorAll('.tab-content');
  elements.tabContentsById = new Map(
    Array.from(elements.tabContents).map(tabContent => [getTabIdForContent(tabContent), tabContent])
  );
  elements.generateTextButton = document.getElementById('generateText');
  elements.randomTextTextarea = document.getElementById('randomTextTextarea');
  elements.saveValueButton = document.getElementById('saveValueButton');
  elements.valueInput = document.getElementById('valueInput');
  elements.savedValues = document.getElementById('savedValues');
  elements.notebook = document.getElementById('notebook');
  elements.hexUpButton = document.getElementById('hexUp');
  elements.hexDownButton = document.getElementById('hexDown');
  elements.hexCharText = document.getElementById('hexCharText');
}

function bindEvents() {
  elements.copyTextButtons.forEach(button => {
    button.addEventListener('click', utils.copyText);
  });
  elements.clearTextButtons.forEach(button => {
    button.addEventListener('click', utils.clearText);
  });
  elements.languageSelect.addEventListener('change', languages.changeLanguage);
  elements.tabHeaders.forEach(tabHeader => {
    tabHeader.addEventListener('click', handleTabHeaderClick);
  });
  elements.generateTextButton.addEventListener('click', tab1.generateText);
  elements.randomTextTextarea.addEventListener('input', tab1.countTheLengthOfTheText);
  elements.saveValueButton.addEventListener('click', tab2.saveValue);
  elements.valueInput.addEventListener('keydown', handleValueInputKeydown);
  elements.savedValues.addEventListener('click', tab2.handleValueClick);
  elements.notebook.addEventListener('input', tab2.saveNotebookContent);
  elements.hexUpButton.addEventListener('click', () => tab1.updateHex(1));
  elements.hexDownButton.addEventListener('click', () => tab1.updateHex(-1));
  elements.hexCharText.addEventListener('wheel', handleHexWheel);
}

function loadInitialState() {
  appState = {
    checkedTabId: getStoredTabId(),
    language: languages.getLanguage()
  };

  elements.languageSelect.value = appState.language;
}

function renderInitialUI() {
  utils.setVersion();
  languages.applyLanguage(appState.language);
  tab2.displaySavedValues();
  tab2.loadNotebookContent();
}

function activateInitialTab() {
  activateTab(appState.checkedTabId);
}

function handleTabHeaderClick(event) {
  activateTab(event.currentTarget.id);
}

function handleValueInputKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    tab2.saveValue();
  }
}

function handleHexWheel(event) {
  event.preventDefault();
  tab1.updateHex(event.deltaY < 0 ? 1 : -1);
}

function getStoredTabId() {
  const storedTabId = localStorage.getItem('checkedTabId');
  const hasStoredTab = Array.from(elements.tabHeaders).some(tabHeader => tabHeader.id === storedTabId);

  return hasStoredTab ? storedTabId : DEFAULT_TAB_ID;
}

function activateTab(tabId) {
  elements.tabContents.forEach(tabContent => {
    tabContent.style.display = 'none';
  });

  elements.tabHeaders.forEach(tabHeader => {
    const isActiveTab = tabHeader.id === tabId;
    tabHeader.classList.toggle('active', isActiveTab);
  });

  const activeTabContent = elements.tabContentsById.get(tabId);

  if (!activeTabContent) {
    return;
  }

  activeTabContent.style.display = 'block';
  appState.checkedTabId = tabId;
  localStorage.setItem('checkedTabId', tabId);
}

function getTabIdForContent(tabContent) {
  return Array.from(tabContent.classList).find(className => className !== 'tab-content');
}







