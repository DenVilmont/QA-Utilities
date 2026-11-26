import {t} from './languages.js';
import {showMessage} from './notify.js';

export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy text.', error);
    showMessage(`${t('copyFailed')} ${error?.message ?? ''}`.trim(), {isError: true});
    return false;
  }
}
