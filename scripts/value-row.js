// One row of a list of values to copy: the value itself (click = copy), a copy icon and, if needed,
// a delete icon. The rows of one list are in a white card (createValueCard). Used by "Saved values" (Notes tab) and by the test data (Utilities tab),
// so both lists look and work the same way.

import {t} from './languages.js';

// Short names for the characters testers use most; the rest is shown as U+XXXX.
const INVISIBLE_NAMES = Object.freeze({
  '\t': 'TAB',
  '\n': 'LF',
  '\r': 'CR',
  '\u00A0': 'NBSP',
  '\u2003': 'EMSP',
  '\u2009': 'THSP',
  '\u200B': 'ZWSP',
  '\u200C': 'ZWNJ',
  '\u200D': 'ZWJ',
  '\u200E': 'LRM',
  '\u200F': 'RLM',
  '\u202A': 'LRE',
  '\u202B': 'RLE',
  '\u202C': 'PDF',
  '\u202D': 'LRO',
  '\u202E': 'RLO',
  '\u2060': 'WJ',
  '\u2066': 'LRI',
  '\u2067': 'RLI',
  '\u2068': 'FSI',
  '\u2069': 'PDI',
  '\uFEFF': 'BOM',
  ' ': 'SP'
});

// Control characters, format characters (zero width, text direction), special spaces, line separators.
const INVISIBLE_PATTERN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}]/u;

function getInvisibleName(character) {
  return INVISIBLE_NAMES[character]
    ?? `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

// True if createValueDisplay() would show at least one mark.
export function hasInvisibleCharacters(value) {
  return /^ +$/.test(value) || INVISIBLE_PATTERN.test(value.replaceAll(' ', ''));
}

// How a value is shown in a list: invisible characters become small grey marks (NBSP, ZWSP, TAB...),
// so a "space" value is not an empty row and RLO does not turn the rest of the row around.
// An ordinary space stays a space, unless the whole value is only spaces.
// Built with text nodes only: values like <img onerror=...> are never parsed as HTML.
export function createValueDisplay(value) {
  const fragment = document.createDocumentFragment();
  const isOnlySpaces = /^ +$/.test(value);
  let text = '';

  const flushText = () => {
    if (text !== '') {
      fragment.append(document.createTextNode(text));
      text = '';
    }
  };

  for (const character of value) {
    const isInvisible = character === ' ' ? isOnlySpaces : INVISIBLE_PATTERN.test(character);

    if (!isInvisible) {
      text += character;
      continue;
    }

    flushText();
    const mark = document.createElement('span');
    mark.className = 'invisible-char';
    mark.textContent = getInvisibleName(character);
    fragment.append(mark);
  }

  flushText();
  return fragment;
}

const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';
const DELETE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function createIconButton(className, action, titleKey, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `value-row-icon ${className}`;
  button.setAttribute('data-action', action);
  button.setAttribute('data-i18n-title', titleKey);
  button.setAttribute('data-i18n-aria-label', titleKey);
  button.setAttribute('aria-label', t(titleKey));
  button.innerHTML = icon;
  return button;
}

// A list of rows is put in a white card: createValueCard() + createValueRow() for each value.
export function createValueCard() {
  const card = document.createElement('div');
  card.className = 'value-card';
  card.setAttribute('role', 'list');
  return card;
}

// attributes: data-* attributes of the row, so the click handler knows which value it is.
// label: optional grey caption before the value.
// singleLine: long values are cut with "…" and shown in full in the tooltip.
export function createValueRow(value, {attributes = {}, label = '', singleLine = false, withDelete = false} = {}) {
  const row = document.createElement('div');
  row.className = 'value-row';
  row.setAttribute('role', 'listitem');
  Object.entries(attributes).forEach(([name, attributeValue]) => {
    row.setAttribute(name, attributeValue);
  });

  const mainButton = document.createElement('button');
  mainButton.type = 'button';
  mainButton.className = singleLine ? 'value-row-main single-line' : 'value-row-main';
  mainButton.setAttribute('data-action', 'copy-value');

  if (singleLine) {
    mainButton.title = value;
  } else {
    mainButton.setAttribute('data-i18n-title', 'copy');
  }

  if (label !== '') {
    const labelElement = document.createElement('span');
    labelElement.className = 'value-label';
    labelElement.textContent = label;
    mainButton.append(labelElement);
  }

  mainButton.append(createValueDisplay(value));
  row.append(mainButton, createIconButton('copy-btn', 'copy-value', 'copy', COPY_ICON));

  if (withDelete) {
    row.append(createIconButton('delete-btn', 'delete-value', 'delete', DELETE_ICON));
  }

  return row;
}
