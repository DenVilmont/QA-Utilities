// Messages of the side panel: one pop-up at the bottom of the panel, the same on every tab
// (it looks like the pop-up of the screenshot editor). Replaces alert() and the old status line of Tools.

import {t} from './languages.js';
import {ToolError} from './tab-access.js';

const MESSAGE_DURATION_MS = 3000;
const ERROR_DURATION_MS = 5000;

let hideTimer = null;

function getToast() {
  return document.getElementById('toast');
}

// sticky: stays until the next message or hideMessage() — for "working..." and progress messages.
export function showMessage(text, {isError = false, sticky = false} = {}) {
  const toast = getToast();
  clearTimeout(hideTimer);
  toast.textContent = text;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');

  if (!sticky) {
    hideTimer = setTimeout(hideMessage, isError ? ERROR_DURATION_MS : MESSAGE_DURATION_MS);
  }
}

export function hideMessage() {
  clearTimeout(hideTimer);
  getToast().classList.remove('visible');
}

export function getErrorText(error) {
  if (error instanceof ToolError) {
    // Chrome's own error text helps to understand what went wrong (for example, a company policy).
    const message = t(error.messageKey);
    return error.details ? `${message} (${error.details})` : message;
  }

  console.error('Action failed.', error);
  return `${t('actionFailed')} ${error?.message ?? ''}`.trim();
}

export function showError(error) {
  showMessage(getErrorText(error), {isError: true});
}
