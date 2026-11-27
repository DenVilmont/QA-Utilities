// Test data page: edit the groups shown at the bottom of the Utilities tab and the saved values of the Notes tab.
// Opened by the gear buttons of the "Test data" and "Saved values" cards (scripts/settings-link.js):
// the address ends with #groups or #saved-values. Every change is saved at once to localStorage;
// the side panel gets a "storage" event and shows the new data.
//
// Left: the list of groups, under the line "Saved values". Right: the chosen group (its subgroups and values)
// or the saved values (one list, no subgroups, no labels).
// Groups, subgroups and values are reordered by dragging. A value or a subgroup can also be dropped
// on another group in the left list to move it there.

import {applyTranslations, getCurrentLanguage, setCurrentLanguage, t} from './languages.js';
import {showMessage} from './notify.js';
import {getSavedValues, normalizeSavedValue, normalizeSavedValues, setSavedValues} from './storage.js';
import {EXPORT_FILE_NAME, createExportText, getGroupTitle, loadGroups, parseImportText, resetGroups, saveGroups} from './test-data.js';
import {createValueDisplay, hasInvisibleCharacters} from './value-row.js';

// The end of the page address: which part is open (see scripts/settings-link.js).
const SAVED_VALUES_HASH = 'saved-values';
const GROUPS_HASH = 'groups';

const elements = {};
let groups = [];
// Index of the group shown on the right, -1 = none.
let selectedGroup = -1;
// The saved values are shown on the right instead of a group.
let isSavedValuesSelected = false;
// Saved values as they are being edited (may have empty or repeated rows; only clean values are stored).
let savedValues = [];
// What is being dragged: {type: 'group' | 'section' | 'value' | 'saved', group, section, value} (indexes).
let drag = null;

document.addEventListener('DOMContentLoaded', () => {
  void initPage();
});

async function initPage() {
  [
    'groupList', 'addGroupForm', 'newGroupName', 'noGroupMessage', 'groupEditor', 'groupNameInput',
    'deleteGroupButton', 'sectionList', 'addSectionButton', 'importButton', 'exportButton', 'resetButton',
    'importFileInput', 'savedValuesItem', 'savedValuesCount', 'savedValuesEditor', 'savedValueList',
    'addSavedValueButton'
  ].forEach(id => {
    elements[id] = document.getElementById(id);
  });

  await setCurrentLanguage(getCurrentLanguage());
  groups = loadGroups();
  selectedGroup = groups.length > 0 ? 0 : -1;
  savedValues = normalizeSavedValues(getSavedValues());
  isSavedValuesSelected = location.hash === `#${SAVED_VALUES_HASH}`;
  bindEvents();
  render();
}


// The gear of the other card was clicked while this page is open: only the "#..." changes.
function handleHashChange() {
  const wantsSavedValues = location.hash === `#${SAVED_VALUES_HASH}`;

  if (wantsSavedValues !== isSavedValuesSelected) {
    isSavedValuesSelected = wantsSavedValues;
    render();
  }
}

// The address shows what is open, so the next gear click (another "#...") is noticed by handleHashChange.
function updateHash() {
  const hash = `#${isSavedValuesSelected ? SAVED_VALUES_HASH : GROUPS_HASH}`;

  if (location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

function bindEvents() {
  elements.groupList.addEventListener('click', handleGroupListClick);
  elements.addGroupForm.addEventListener('submit', handleAddGroup);
  elements.groupNameInput.addEventListener('input', handleGroupNameInput);
  elements.deleteGroupButton.addEventListener('click', deleteSelectedGroup);
  elements.addSectionButton.addEventListener('click', addSection);
  elements.sectionList.addEventListener('input', handleSectionListInput);
  elements.sectionList.addEventListener('click', handleSectionListClick);
  elements.importButton.addEventListener('click', () => elements.importFileInput.click());
  elements.importFileInput.addEventListener('change', () => void importFile());
  elements.exportButton.addEventListener('click', exportFile);
  elements.resetButton.addEventListener('click', resetToDefaults);
  elements.savedValuesItem.addEventListener('click', selectSavedValues);
  elements.savedValuesItem.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectSavedValues();
    }
  });
  elements.addSavedValueButton.addEventListener('click', addSavedValue);
  elements.savedValueList.addEventListener('input', handleSavedValueInput);
  elements.savedValueList.addEventListener('click', handleSavedValueListClick);

  // Dragging
  elements.groupList.addEventListener('dragstart', handleGroupDragStart);
  elements.sectionList.addEventListener('pointerdown', handleHandlePointerDown);
  elements.sectionList.addEventListener('dragstart', handleSectionListDragStart);
  elements.groupList.addEventListener('dragover', handleGroupListDragOver);
  elements.groupList.addEventListener('drop', handleGroupListDrop);
  elements.sectionList.addEventListener('dragover', handleSectionListDragOver);
  elements.sectionList.addEventListener('drop', handleSectionListDrop);
  elements.savedValueList.addEventListener('pointerdown', handleHandlePointerDown);
  elements.savedValueList.addEventListener('dragstart', handleSavedValueDragStart);
  elements.savedValueList.addEventListener('dragover', handleSavedValueListDragOver);
  elements.savedValueList.addEventListener('drop', handleSavedValueListDrop);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('pointerup', resetDraggableRows);

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('hashchange', handleHashChange);
}

// ---------- Saving ----------

function save() {
  if (!saveGroups(groups)) {
    showMessage(t('NotSavedStorageFull'), {isError: true});
  }
}

// Saved values: only clean ones are stored (trimmed, not empty, no repeats), like the Notes tab does.
function saveSavedValues() {
  if (!setSavedValues(normalizeSavedValues(savedValues))) {
    showMessage(t('NotSavedStorageFull'), {isError: true});
  }
}

function getSelectedGroup() {
  return isSavedValuesSelected ? null : groups[selectedGroup] ?? null;
}

// Values the panel shows: an empty value is a row that was added and not filled yet.
function countValues(group) {
  return group.sections.reduce((count, section) => count + section.values.filter(item => item.value !== '').length, 0);
}

// ---------- Rendering ----------

function render() {
  renderGroupList();
  renderSavedValuesItem();
  renderGroupEditor();
  renderSavedValuesEditor();
  applyTranslations();
  updateHash();
}

function renderGroupList() {
  const items = groups.map((group, index) => {
    const item = document.createElement('div');
    item.className = index === selectedGroup && !isSavedValuesSelected ? 'group-item selected' : 'group-item';
    item.draggable = true;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-group-index', String(index));

    const handle = createDragHandle();
    const name = document.createElement('span');
    name.className = 'group-item-name';
    name.textContent = getGroupTitle(group);

    const count = document.createElement('span');
    count.className = 'group-item-count';
    count.textContent = String(countValues(group));

    item.append(handle, name, count);
    return item;
  });

  elements.groupList.replaceChildren(...items);
}

function renderSavedValuesItem() {
  elements.savedValuesItem.classList.toggle('selected', isSavedValuesSelected);
  elements.savedValuesCount.textContent = String(normalizeSavedValues(savedValues).length);
}

function renderGroupEditor() {
  const group = getSelectedGroup();
  elements.noGroupMessage.hidden = group !== null || isSavedValuesSelected;
  elements.groupEditor.hidden = group === null;

  if (!group) {
    elements.sectionList.replaceChildren();
    return;
  }

  if (elements.groupNameInput.value !== group.name) {
    elements.groupNameInput.value = group.name;
  }

  elements.sectionList.replaceChildren(...group.sections.map(createSectionCard));
  elements.sectionList.querySelectorAll('textarea').forEach(fitTextareaHeight);
}

function createDragHandle() {
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.setAttribute('data-i18n-title', 'testDataDragHint');
  handle.setAttribute('aria-hidden', 'true');
  handle.textContent = '\u283F';
  return handle;
}

function createIconButton(action, titleKey) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button danger';
  button.setAttribute('data-action', action);
  button.setAttribute('data-i18n-title', titleKey);
  button.setAttribute('data-i18n-aria-label', titleKey);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  return button;
}

function createSectionCard(section, sectionIndex) {
  const card = document.createElement('div');
  card.className = 'section-card';
  card.setAttribute('data-section-index', String(sectionIndex));

  const header = document.createElement('div');
  header.className = 'section-card-header';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 100;
  nameInput.className = 'section-name-input';
  nameInput.value = section.name;
  nameInput.setAttribute('data-i18n-placeholder', 'testDataSectionName');

  header.append(createDragHandle(), nameInput, createIconButton('delete-section', 'testDataDeleteSection'));

  const valueList = document.createElement('div');
  valueList.className = 'value-list';
  valueList.append(...section.values.map(createValueRow));

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'text-button';
  addButton.setAttribute('data-action', 'add-value');
  const addText = document.createElement('span');
  addText.setAttribute('data-i18n', 'testDataAddValue');
  addButton.append('+ ', addText);

  card.append(header, valueList, addButton);
  return card;
}

function createValueRow(item, valueIndex) {
  const row = document.createElement('div');
  row.className = 'value-row';
  row.setAttribute('data-value-index', String(valueIndex));

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.maxLength = 100;
  labelInput.className = 'value-label-input';
  labelInput.value = item.label;
  labelInput.setAttribute('data-i18n-placeholder', 'testDataLabel');

  const valueCell = document.createElement('div');
  valueCell.className = 'value-cell';

  const valueInput = document.createElement('textarea');
  valueInput.className = 'value-input';
  valueInput.rows = 1;
  valueInput.spellcheck = false;
  valueInput.value = item.value;
  valueInput.setAttribute('data-i18n-placeholder', 'testDataValue');

  const preview = document.createElement('div');
  preview.className = 'value-preview';
  valueCell.append(valueInput, preview);
  renderValuePreview(preview, item.value);

  row.append(createDragHandle(), labelInput, valueCell, createIconButton('delete-value', 'delete'));
  return row;
}

// Invisible characters (NBSP, ZWSP, TAB...) cannot be seen in the text field: show them with marks below it,
// the same way as in the side panel.
function renderValuePreview(preview, value) {
  const isVisible = hasInvisibleCharacters(value);
  preview.hidden = !isVisible;
  preview.replaceChildren(isVisible ? createValueDisplay(value) : '');
}

function fitTextareaHeight(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

// ---------- Groups ----------

function selectGroup(index) {
  selectedGroup = index;
  isSavedValuesSelected = false;
  render();
}

function selectSavedValues() {
  isSavedValuesSelected = true;
  render();
}

function handleGroupListClick(event) {
  const item = event.target.closest('.group-item');

  if (item) {
    selectGroup(Number(item.getAttribute('data-group-index')));
  }
}

function handleAddGroup(event) {
  event.preventDefault();
  const name = elements.newGroupName.value.trim();

  if (name === '') {
    elements.newGroupName.focus();
    return;
  }

  groups.push({name, sections: [{name: '', values: []}]});
  elements.newGroupName.value = '';
  save();
  selectGroup(groups.length - 1);
}

function handleGroupNameInput() {
  const group = getSelectedGroup();

  if (!group) {
    return;
  }

  group.name = elements.groupNameInput.value;
  save();
  renderGroupList();
  applyTranslations(elements.groupList);
}

function deleteSelectedGroup() {
  const group = getSelectedGroup();

  if (!group) {
    return;
  }

  if (countValues(group) > 0 && !confirm(t('testDataDeleteGroupConfirm').replace('$1', getGroupTitle(group)))) {
    return;
  }

  groups.splice(selectedGroup, 1);
  selectedGroup = Math.min(selectedGroup, groups.length - 1);
  save();
  render();
}

// ---------- Sections and values ----------

function addSection() {
  const group = getSelectedGroup();

  if (!group) {
    return;
  }

  group.sections.push({name: '', values: []});
  save();
  render();
  elements.sectionList.querySelector('.section-card:last-child .section-name-input')?.focus();
}

function getRowPosition(element) {
  const card = element.closest('.section-card');
  const row = element.closest('.value-row');

  return {
    section: card ? Number(card.getAttribute('data-section-index')) : -1,
    value: row ? Number(row.getAttribute('data-value-index')) : -1
  };
}

function handleSectionListInput(event) {
  const group = getSelectedGroup();
  const target = event.target;
  const position = getRowPosition(target);
  const section = group?.sections[position.section];

  if (!section) {
    return;
  }

  if (target.classList.contains('section-name-input')) {
    section.name = target.value;
  } else if (target.classList.contains('value-label-input')) {
    section.values[position.value].label = target.value;
  } else if (target.classList.contains('value-input')) {
    const item = section.values[position.value];
    item.value = readTextareaValue(target, item.value);
    fitTextareaHeight(target);
    renderValuePreview(target.parentElement.querySelector('.value-preview'), item.value);
  } else {
    return;
  }

  save();
  // The number of values next to the group name may change (an empty value is not counted).
  renderGroupList();
  applyTranslations(elements.groupList);
}

// A text field always gives line breaks as "\n", even if the value had "\r\n".
// If the value used "\r\n" before editing, keep it that way (the default "CRLF" value).
function readTextareaValue(textarea, previousValue) {
  const value = textarea.value;
  return previousValue.includes('\r\n') ? value.replace(/\r?\n/g, '\r\n') : value;
}

function handleSectionListClick(event) {
  const button = event.target.closest('[data-action]');
  const group = getSelectedGroup();

  if (!button || !group) {
    return;
  }

  const position = getRowPosition(button);
  const section = group.sections[position.section];
  const action = button.getAttribute('data-action');

  if (!section) {
    return;
  }

  if (action === 'add-value') {
    section.values.push({label: '', value: ''});
    save();
    render();
    elements.sectionList
      .querySelector(`.section-card[data-section-index="${position.section}"] .value-row:last-child .value-input`)
      ?.focus();
    return;
  }

  if (action === 'delete-value') {
    section.values.splice(position.value, 1);
  } else if (action === 'delete-section') {
    const hasValues = section.values.some(item => item.value !== '');
    const sectionTitle = section.name || t('testDataUntitledSection');

    if (hasValues && !confirm(t('testDataDeleteSectionConfirm').replace('$1', sectionTitle))) {
      return;
    }

    group.sections.splice(position.section, 1);
  } else {
    return;
  }

  save();
  render();
}

// ---------- Dragging ----------

// Rows with text fields can be dragged only by the handle: if the whole row were draggable,
// selecting text in a field with the mouse would start dragging the row.
function handleHandlePointerDown(event) {
  const handle = event.target.closest('.drag-handle');

  if (handle) {
    handle.closest('.value-row, .section-card').draggable = true;
  }
}

function resetDraggableRows() {
  document.querySelectorAll('.value-row[draggable="true"], .section-card[draggable="true"]').forEach(element => {
    element.draggable = false;
  });
}

function startDrag(event, element, dragInfo) {
  drag = dragInfo;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', '');
  element.classList.add('dragging');
}

function handleGroupDragStart(event) {
  const item = event.target.closest('.group-item');

  if (item) {
    startDrag(event, item, {type: 'group', group: Number(item.getAttribute('data-group-index'))});
  }
}

function handleSectionListDragStart(event) {
  const element = event.target;

  if (element.classList?.contains('value-row')) {
    const position = getRowPosition(element);
    startDrag(event, element, {type: 'value', group: selectedGroup, section: position.section, value: position.value});
  } else if (element.classList?.contains('section-card')) {
    startDrag(event, element, {type: 'section', group: selectedGroup, section: getRowPosition(element).section});
  }
}

function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach(element => {
    element.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
}

function handleDragEnd() {
  clearDropMarks();
  document.querySelectorAll('.dragging').forEach(element => element.classList.remove('dragging'));
  resetDraggableRows();
  drag = null;
}

// true if the pointer is in the lower half of the element: drop after it.
function isAfter(event, element) {
  const rect = element.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

// Where a dragged element would go: {target element, mark class, index to insert at...}; null = cannot drop here.
function getGroupListDrop(event) {
  const item = event.target.closest('.group-item');

  // Saved values stay saved values: they are not moved into test data groups.
  if (!drag || !item || drag.type === 'saved') {
    return null;
  }

  const index = Number(item.getAttribute('data-group-index'));

  if (drag.type === 'group') {
    const after = isAfter(event, item);
    return {element: item, mark: after ? 'drop-after' : 'drop-before', index: index + (after ? 1 : 0)};
  }

  // A subgroup or a value dropped on another group moves there.
  return index === drag.group ? null : {element: item, mark: 'drop-into', index};
}

function getSectionListDrop(event) {
  if (drag?.type === 'section') {
    const card = event.target.closest('.section-card');

    if (!card) {
      return null;
    }

    const after = isAfter(event, card);
    const index = Number(card.getAttribute('data-section-index'));
    return {element: card, mark: after ? 'drop-after' : 'drop-before', index: index + (after ? 1 : 0)};
  }

  if (drag?.type === 'value') {
    const row = event.target.closest('.value-row');
    const card = event.target.closest('.section-card');

    if (row) {
      const after = isAfter(event, row);
      const position = getRowPosition(row);
      return {
        element: row,
        mark: after ? 'drop-after' : 'drop-before',
        section: position.section,
        index: position.value + (after ? 1 : 0)
      };
    }

    // Over a subgroup but not over a value (its header, an empty list): to the end of that subgroup.
    if (card) {
      const section = getRowPosition(card).section;
      return {element: card, mark: 'drop-into', section, index: getSelectedGroup().sections[section].values.length};
    }
  }

  return null;
}

function showDropMark(event, dropTarget) {
  clearDropMarks();

  if (!dropTarget) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  dropTarget.element.classList.add(dropTarget.mark);
}

function handleGroupListDragOver(event) {
  showDropMark(event, getGroupListDrop(event));
}

function handleSectionListDragOver(event) {
  showDropMark(event, getSectionListDrop(event));
}

// Moves list[from] so that it ends up where index "to" pointed before the move.
function moveInList(list, from, to) {
  const [item] = list.splice(from, 1);
  list.splice(to > from ? to - 1 : to, 0, item);
}

function handleGroupListDrop(event) {
  const dropTarget = getGroupListDrop(event);

  if (!dropTarget) {
    return;
  }

  event.preventDefault();
  const currentGroup = groups[selectedGroup];

  if (drag.type === 'group') {
    moveInList(groups, drag.group, dropTarget.index);
  } else {
    const sourceGroup = groups[drag.group];
    const targetGroup = groups[dropTarget.index];

    if (drag.type === 'section') {
      targetGroup.sections.push(...sourceGroup.sections.splice(drag.section, 1));
    } else {
      const [item] = sourceGroup.sections[drag.section].values.splice(drag.value, 1);
      getSectionForMovedValue(targetGroup).values.push(item);
    }
  }

  // The same group stays open, even if its place in the list changed.
  selectedGroup = groups.indexOf(currentGroup);
  finishDrop();
}

// A value moved to another group goes to its part without a subgroup (or to the last subgroup).
function getSectionForMovedValue(group) {
  const section = group.sections.find(candidate => candidate.name === '') ?? group.sections.at(-1);

  if (section) {
    return section;
  }

  const newSection = {name: '', values: []};
  group.sections.push(newSection);
  return newSection;
}

function handleSectionListDrop(event) {
  const dropTarget = getSectionListDrop(event);
  const group = getSelectedGroup();

  if (!dropTarget || !group) {
    return;
  }

  event.preventDefault();

  if (drag.type === 'section') {
    moveInList(group.sections, drag.section, dropTarget.index);
  } else if (drag.section === dropTarget.section) {
    moveInList(group.sections[drag.section].values, drag.value, dropTarget.index);
  } else {
    const [item] = group.sections[drag.section].values.splice(drag.value, 1);
    group.sections[dropTarget.section].values.splice(dropTarget.index, 0, item);
  }

  finishDrop();
}

function finishDrop() {
  handleDragEnd();
  save();
  render();
}

// ---------- Import, export, defaults ----------

async function importFile() {
  const file = elements.importFileInput.files[0];
  elements.importFileInput.value = '';

  if (!file) {
    return;
  }

  const imported = parseImportText(await file.text());

  if (!imported) {
    showMessage(t('testDataImportFailed'), {isError: true});
    return;
  }

  if (!confirm(getImportQuestion(imported))) {
    return;
  }

  // A part the file does not have stays as it is.
  if (imported.groups) {
    groups = imported.groups;
    selectedGroup = 0;
    save();
  }

  if (imported.savedValues) {
    savedValues = imported.savedValues;
    saveSavedValues();
  }

  render();
  showMessage(t('testDataImported'));
}

function getImportQuestion({groups: importedGroups, savedValues: importedValues}) {
  if (importedGroups && importedValues) {
    return t('testDataImportConfirmBoth')
      .replace('$1', String(importedGroups.length))
      .replace('$2', String(importedValues.length));
  }

  return importedGroups
    ? t('testDataImportConfirm').replace('$1', String(importedGroups.length))
    : t('testDataImportConfirmSaved').replace('$1', String(importedValues.length));
}

function exportFile() {
  const blob = new Blob([createExportText(groups, savedValues)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetToDefaults() {
  if (!confirm(t('testDataResetConfirm'))) {
    return;
  }

  // Only the test data groups: the saved values (logins, passwords) are the user's own, there is no default for them.
  groups = resetGroups();
  selectedGroup = groups.length > 0 ? 0 : -1;
  isSavedValuesSelected = false;
  render();
  showMessage(t('testDataResetDone'));
}

// ---------- Changes from other pages ----------

async function handleStorageChange(event) {
  if (event.key === 'language') {
    await setCurrentLanguage(event.newValue);
    render();
    return;
  }

  // Another test data tab changed the data (normally there is only one, the gear button switches to it).
  if (event.key === 'testData' || event.key === null) {
    groups = loadGroups();
    selectedGroup = Math.min(selectedGroup, groups.length - 1);
    render();
  }

  // A value was saved or deleted in the side panel (Notes tab).
  if (event.key === 'savedValues' || event.key === null) {
    savedValues = normalizeSavedValues(getSavedValues());
    render();
  }
}

// ---------- Saved values ----------

function renderSavedValuesEditor() {
  elements.savedValuesEditor.hidden = !isSavedValuesSelected;

  if (isSavedValuesSelected) {
    elements.savedValueList.replaceChildren(...savedValues.map(createSavedValueRow));
    markUnsavedValues();
  }
}

// Empty values and repeats are not stored (see saveSavedValues), so they would be gone after a reload:
// such rows get a note, so it is clear before that.
function markUnsavedValues() {
  const seen = new Set();

  elements.savedValueList.querySelectorAll('.value-row').forEach(row => {
    const value = normalizeSavedValue(row.querySelector('input').value);
    let noteKey = '';

    if (value === '') {
      noteKey = 'savedValueEmpty';
    } else if (seen.has(value)) {
      noteKey = 'savedValueDuplicate';
    }

    seen.add(value);
    row.classList.toggle('not-saved', noteKey === 'savedValueDuplicate');
    row.classList.toggle('empty-value', noteKey === 'savedValueEmpty');
    const note = row.querySelector('.row-note');
    note.hidden = noteKey === '';
    note.textContent = noteKey ? t(noteKey) : '';
  });
}

function createSavedValueRow(value, index) {
  const row = document.createElement('div');
  row.className = 'value-row';
  row.setAttribute('data-value-index', String(index));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'saved-value-input';
  input.spellcheck = false;
  input.value = value;
  input.setAttribute('data-i18n-placeholder', 'testDataValue');

  const note = document.createElement('span');
  note.className = 'row-note';
  note.hidden = true;

  row.append(createDragHandle(), input, note, createIconButton('delete-value', 'delete'));
  return row;
}

function addSavedValue() {
  savedValues.push('');
  render();
  elements.savedValueList.querySelector('.value-row:last-child input')?.focus();
}

function handleSavedValueInput(event) {
  const row = event.target.closest('.value-row');

  if (!row) {
    return;
  }

  savedValues[Number(row.getAttribute('data-value-index'))] = event.target.value;
  saveSavedValues();
  renderSavedValuesItem();
  markUnsavedValues();
}

function handleSavedValueListClick(event) {
  const button = event.target.closest('[data-action="delete-value"]');

  if (!button) {
    return;
  }

  savedValues.splice(Number(button.closest('.value-row').getAttribute('data-value-index')), 1);
  saveSavedValues();
  render();
}

function handleSavedValueDragStart(event) {
  const row = event.target;

  if (row.classList?.contains('value-row')) {
    startDrag(event, row, {type: 'saved', value: Number(row.getAttribute('data-value-index'))});
  }
}

function getSavedValueListDrop(event) {
  const row = event.target.closest('.value-row');

  if (drag?.type !== 'saved' || !row) {
    return null;
  }

  const after = isAfter(event, row);
  const index = Number(row.getAttribute('data-value-index'));
  return {element: row, mark: after ? 'drop-after' : 'drop-before', index: index + (after ? 1 : 0)};
}

function handleSavedValueListDragOver(event) {
  showDropMark(event, getSavedValueListDrop(event));
}

function handleSavedValueListDrop(event) {
  const dropTarget = getSavedValueListDrop(event);

  if (!dropTarget) {
    return;
  }

  event.preventDefault();
  moveInList(savedValues, drag.value, dropTarget.index);
  handleDragEnd();
  saveSavedValues();
  render();
}
