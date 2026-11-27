// "Test data" block at the bottom of the Utilities tab: choose a group, click a value to copy it
// or, in the "Type" / "Bypass" modes, to put it into the field with the cursor on the page (scripts/page-insert.js).
// The copy button of a row always copies. The groups are edited on the test data page (pages/test-data.html, the gear button).
// The chosen group and mode are not remembered: the block is used now and then, and without a group the tab stays short.

import {applyTranslations, t} from './languages.js';
import {copyTextToClipboard} from './clipboard.js';
import {getGroupTitle, loadGroups} from './test-data.js';
import {createValueCard, createValueRow} from './value-row.js';
import {INSERT_MODES, insertIntoPage} from './page-insert.js';
import {SETTINGS_SECTIONS, openSettingsPage} from './settings-link.js';

const elements = {};
let groups = [];
// Index of the chosen group, -1 = none.
let selectedIndex = -1;
// What a click on a value does: INSERT_MODES.copy, .type or .bypass.
let insertMode = INSERT_MODES.copy;

function renderGroupSelect() {
  const select = elements.groupSelect;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t(groups.length > 0 ? 'testDataChooseGroup' : 'testDataNoGroups');

  const options = groups.map((group, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = getGroupTitle(group);
    return option;
  });

  select.replaceChildren(placeholder, ...options);
  select.value = selectedIndex >= 0 ? String(selectedIndex) : '';
  select.disabled = groups.length === 0;
  elements.clearButton.hidden = selectedIndex < 0;
  elements.modeButtons.hidden = selectedIndex < 0;
  elements.modeButtons.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('active', button.getAttribute('data-mode') === insertMode);
  });
}

function renderValues() {
  const container = elements.values;
  const group = groups[selectedIndex];

  if (!group) {
    container.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();

  group.sections.forEach((section, sectionIndex) => {
    const rows = [];

    section.values.forEach((item, valueIndex) => {
      // An empty value is a row the user has just added on the settings page and not filled yet.
      if (item.value === '') {
        return;
      }

      rows.push(createValueRow(item.value, {
        attributes: {'data-section-index': String(sectionIndex), 'data-value-index': String(valueIndex)},
        label: item.label,
        singleLine: true
      }));
    });

    if (rows.length === 0) {
      return;
    }

    if (section.name !== '') {
      const title = document.createElement('div');
      title.className = 'test-data-section-title';
      title.textContent = section.name;
      const count = document.createElement('span');
      count.className = 'test-data-section-count';
      count.textContent = ` \u00B7 ${rows.length}`;
      title.append(count);
      fragment.append(title);
    }

    const card = createValueCard();
    card.append(...rows);
    fragment.append(card);
  });

  if (!fragment.hasChildNodes()) {
    const empty = document.createElement('div');
    empty.className = 'test-data-empty';
    empty.textContent = t('testDataNoValues');
    fragment.append(empty);
  }

  container.replaceChildren(fragment);
  applyTranslations(container);
}

function render() {
  renderGroupSelect();
  renderValues();
}

function handleGroupChange() {
  const index = Number.parseInt(elements.groupSelect.value, 10);
  selectedIndex = Number.isInteger(index) && groups[index] ? index : -1;
  render();
}

function clearGroup() {
  selectedIndex = -1;
  render();
}

function handleModeClick(event) {
  const mode = event.target.closest('[data-mode]')?.getAttribute('data-mode');

  if (mode) {
    insertMode = mode;
    renderGroupSelect();
  }
}

// The value itself: what the chosen mode does. The copy button next to it: always copy.
function handleValuesClick(event) {
  const actionElement = event.target instanceof Element ? event.target.closest('[data-action="copy-value"]') : null;
  const row = actionElement?.closest('[data-value-index]');

  if (!row) {
    return;
  }

  const section = groups[selectedIndex]?.sections[Number(row.getAttribute('data-section-index'))];
  const item = section?.values[Number(row.getAttribute('data-value-index'))];

  if (!item) {
    return;
  }

  const isCopyButton = actionElement.classList.contains('copy-btn');

  if (isCopyButton || insertMode === INSERT_MODES.copy) {
    void copyTextToClipboard(item.value);
  } else {
    void insertIntoPage(item.value, insertMode);
  }
}

export function initTestData() {
  elements.groupSelect = document.getElementById('testDataGroupSelect');
  elements.clearButton = document.getElementById('clearTestDataGroupButton');
  elements.values = document.getElementById('testDataValues');
  elements.settingsButton = document.getElementById('testDataSettingsButton');
  elements.modeButtons = document.getElementById('insertModeButtons');

  elements.groupSelect.addEventListener('change', handleGroupChange);
  elements.clearButton.addEventListener('click', clearGroup);
  elements.values.addEventListener('click', handleValuesClick);
  elements.settingsButton.addEventListener('click', () => void openSettingsPage(SETTINGS_SECTIONS.groups));
  elements.modeButtons.addEventListener('click', handleModeClick);

  groups = loadGroups();
  render();
}

// The groups were changed on the settings page. Keep the chosen group if it is still there:
// same place and name, moved by dragging (found by name) or renamed (same place, the number of groups did not change).
// Otherwise show none.
export function reloadTestData() {
  const selectedName = groups[selectedIndex]?.name;
  const previousCount = groups.length;
  groups = loadGroups();

  if (selectedIndex >= 0 && groups[selectedIndex]?.name !== selectedName) {
    const movedIndex = groups.findIndex(group => group.name === selectedName);
    const isRenamed = movedIndex === -1 && groups.length === previousCount;
    selectedIndex = isRenamed ? selectedIndex : movedIndex;
  }

  render();
}

// The language was changed: texts that are not in data-i18n attributes.
export function refreshTestDataView() {
  render();
}
