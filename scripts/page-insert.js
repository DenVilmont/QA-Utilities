// Puts a test value straight into the field where the cursor is on the page (active tab),
// instead of copying it. Two ways:
//   type   - character by character: keydown -> the character -> keyup, with a short pause.
//            Catches what reacts to keys: input masks, autocomplete, search with a delay.
//   bypass - the whole value is written into the field at once, then "input" and "change" are sent.
//            maxlength and key filters do not stop it: handy to check the validation on the server.
//
// Events sent by a script are marked by the browser as "not real" (isTrusted = false). Fully real input
// is only possible with chrome.debugger, which shows the yellow "extension is debugging this browser" bar,
// so it is not used. Angular forms listen to "input", so they see both ways.

import {t} from './languages.js';
import {hideMessage, showError, showMessage} from './notify.js';
import {ToolError, assertSupportedPage, ensureSiteAccess, getActiveTab} from './tab-access.js';

export const INSERT_MODES = Object.freeze({copy: 'copy', type: 'type', bypass: 'bypass'});

// Pause between characters when typing (milliseconds).
const TYPE_DELAY_MS = 25;

let isTyping = false;

// ---------- Runs inside the page (each frame); must not use anything from outside the function ----------

// What has the cursor in this frame: 'input', 'contenteditable', 'frame' (the cursor is inside an iframe) or null.
// The side panel has the keyboard focus, but every frame still remembers its last focused element.
function pageGetFocusedFieldKind() {
  const element = document.activeElement;
  const notTextTypes = ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];

  if (element instanceof HTMLTextAreaElement
    || (element instanceof HTMLInputElement && !notTextTypes.includes(element.type))) {
    return element.disabled || element.readOnly ? null : 'input';
  }

  if (element instanceof HTMLIFrameElement || element instanceof HTMLFrameElement) {
    return 'frame';
  }

  return element?.isContentEditable ? 'contenteditable' : null;
}

// Returns {typed: characters in the field at the end, expected: characters of the value, rejected: true
// if the browser did not accept the value (for example letters in type="number")}; null if no field.
async function pageInsertValue(value, mode, delayMs) {
  const element = document.activeElement;
  const isTextField = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;

  if (!element || (!isTextField && !element.isContentEditable)) {
    return null;
  }

  const countCharacters = text => [...text].length;
  const getText = () => (isTextField ? element.value : element.textContent);

  // Writes the value the way the page cannot intercept: the setter of the browser itself,
  // not the one a framework may have put on the element.
  const setText = text => {
    if (isTextField) {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text);
    } else {
      element.textContent = text;
    }
  };

  const sendInput = (inputType, data) => {
    element.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, inputType, data}));
  };

  // Like Ctrl+A: what is typed replaces the old text.
  const selectAll = () => {
    if (isTextField) {
      element.select();
    } else {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  // Some input types (email, number) have no cursor position: selectionStart throws or is null.
  const getSelectionRange = () => {
    try {
      return element.selectionStart === null ? null : [element.selectionStart, element.selectionEnd];
    } catch {
      return null;
    }
  };

  // Fields without a cursor position (email, number) cannot select their text:
  // the first character typed by hand replaces the old text instead.
  let replaceOldText = false;

  // Puts one character where the cursor is, as the browser does for a key press.
  // execCommand respects maxlength, the cursor and Ctrl+Z; if it does not work (it needs the
  // selection in this document), the character is inserted by hand, also respecting maxlength.
  const insertCharacter = character => {
    const isFirstCharacter = replaceOldText;
    replaceOldText = false;
    const textBefore = getText();

    if (document.execCommand('insertText', false, character) && getText() !== textBefore) {
      return;
    }

    if (!isTextField) {
      return;
    }

    const before = isFirstCharacter ? '' : textBefore;
    const range = getSelectionRange() ?? [before.length, before.length];
    const next = before.slice(0, range[0]) + character + before.slice(range[1]);

    if (element.maxLength >= 0 && next.length > element.maxLength) {
      return;
    }

    setText(next);

    if (getSelectionRange()) {
      element.setSelectionRange(range[0] + character.length, range[0] + character.length);
    }

    sendInput('insertText', character);
  };

  element.focus();

  if (mode === 'bypass') {
    setText(value);
    sendInput('insertFromPaste', value);
    element.dispatchEvent(new Event('change', {bubbles: true}));
    // Line breaks do not count: a text field always keeps them as "\n", a one-line field drops them.
    const withoutLineBreaks = text => text.replace(/[\r\n]/g, '');
    const isRejected = withoutLineBreaks(getText()) !== withoutLineBreaks(value);
    return {typed: countCharacters(getText()), expected: countCharacters(value), rejected: isRejected};
  }

  selectAll();
  replaceOldText = isTextField && getSelectionRange() === null;
  // The Enter key gives one line break, not "\r\n".
  const keys = value.replaceAll('\r\n', '\n');

  for (const character of keys) {
    const key = {'\n': 'Enter', '\r': 'Enter', '\t': 'Tab'}[character] ?? character;
    const keyOptions = {key, bubbles: true, cancelable: true, composed: true};

    // A page that cancels keydown (a mask that does not allow the character) stops the character, as with real keys.
    if (element.dispatchEvent(new KeyboardEvent('keydown', keyOptions))) {
      element.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
      insertCharacter(character);
    }

    element.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  element.dispatchEvent(new Event('change', {bubbles: true}));
  return {typed: countCharacters(getText()), expected: countCharacters(keys), rejected: false};
}

// ---------- Side panel ----------

// The frame with the field: the page itself if the cursor is there. If the cursor is inside an iframe,
// the frame that has a field. An iframe remembers its field even after a click elsewhere on the page,
// so the frames are checked only when the page says the cursor is in one of them.
async function findFieldFrame(tabId) {
  const results = await chrome.scripting.executeScript({target: {tabId, allFrames: true}, func: pageGetFocusedFieldKind});
  const isField = result => result.result === 'input' || result.result === 'contenteditable';
  const page = results.find(result => result.frameId === 0);

  if (page && isField(page)) {
    return page;
  }

  return page?.result === 'frame' ? results.find(result => result.frameId !== 0 && isField(result)) ?? null : null;
}

function getResultText(mode, result) {
  if (mode === INSERT_MODES.bypass) {
    return result.rejected
      ? t('insertRejected')
      : t('insertBypassDone').replace('$1', String(result.typed));
  }

  return result.typed < result.expected
    ? t('insertTypedLimited').replace('$1', String(result.typed)).replace('$2', String(result.expected))
    : t('insertTypedDone').replace('$1', String(result.typed));
}

// Must be called synchronously from the click handler: see ensureSiteAccess.
export function insertIntoPage(value, mode) {
  if (isTyping) {
    showMessage(t('insertBusy'), {isError: true});
    return Promise.resolve();
  }

  let isAccessPromptShown = false;
  const accessRequest = ensureSiteAccess(() => {
    isAccessPromptShown = true;
    showMessage(t('allowSiteAccess'), {sticky: true});
  });

  return (async () => {
    try {
      await accessRequest;

      if (isAccessPromptShown) {
        hideMessage();
      }

      const tab = await getActiveTab();
      assertSupportedPage(tab);
      const frame = await findFieldFrame(tab.id);

      if (!frame) {
        throw new ToolError('insertNoField');
      }

      isTyping = mode === INSERT_MODES.type;

      if (isTyping) {
        showMessage(t('insertTyping'), {sticky: true});
      }

      const [injection] = await chrome.scripting.executeScript({
        target: {tabId: tab.id, frameIds: [frame.frameId]},
        func: pageInsertValue,
        args: [value, mode, TYPE_DELAY_MS]
      });

      if (!injection?.result) {
        throw new ToolError('insertNoField');
      }

      showMessage(getResultText(mode, injection.result), {isError: injection.result.rejected});
    } catch (error) {
      showError(error);
    } finally {
      isTyping = false;
    }
  })();
}
