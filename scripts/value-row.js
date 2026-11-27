// One row of a list of values to copy: the value itself (click = copy), a copy button and, if needed,
// a delete button. Used by "Saved values" (Notes tab) and by the test data (Utilities tab),
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

function createIconButton(className, action, titleKey, html) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('data-action', action);
  button.setAttribute('data-i18n-title', titleKey);
  button.setAttribute('data-i18n-aria-label', titleKey);
  button.setAttribute('aria-label', t(titleKey));
  button.innerHTML = html;
  return button;
}

// attributes: data-* attributes of the row, so the click handler knows which value it is.
// label: optional grey caption before the value.
// singleLine: long values are cut with "…" and shown in full in the tooltip.
export function createValueRow(value, {attributes = {}, label = '', singleLine = false, withDelete = false} = {}) {
  const container = document.createElement('div');
  container.className = 'saved-value-container';
  container.setAttribute('role', 'listitem');
  Object.entries(attributes).forEach(([name, attributeValue]) => {
    container.setAttribute(name, attributeValue);
  });

  const valueButton = document.createElement('button');
  valueButton.type = 'button';
  valueButton.className = singleLine ? 'saved-value single-line' : 'saved-value';
  valueButton.setAttribute('data-action', 'copy-value');

  if (singleLine) {
    valueButton.title = value;
  } else {
    valueButton.setAttribute('data-i18n-title', 'copy');
  }

  if (label !== '') {
    const labelElement = document.createElement('span');
    labelElement.className = 'value-label';
    labelElement.textContent = label;
    valueButton.append(labelElement);
  }

  valueButton.append(createValueDisplay(value));
  container.append(valueButton, createIconButton('copy-btn', 'copy-value', 'copy', '&#x1f5d0;'));

  if (withDelete) {
    container.append(createIconButton('delete-btn', 'delete-value', 'delete', '&#x26cc;'));
  }

  return container;
}
