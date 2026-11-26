import {t} from './languages.js';
import {copyTextToClipboard} from './clipboard.js';
import {getCharacterFromHexInput, getSteppedHexInputValue} from './hex.js';
import {MAX_TEXT_LENGTH, generateLoremIpsum, generateRandomText, getTextLength} from './text.js';

function parseTextLengthInput(value) {
    const trimmedValue = `${value ?? ''}`.trim();

    if (!/^\d+$/.test(trimmedValue)) {
        return null;
    }

    const length = Number.parseInt(trimmedValue, 10);
    return length > 0 && length <= MAX_TEXT_LENGTH ? length : null;
}

export function generateText() {
    const textLength = parseTextLengthInput(document.getElementById('textLength').value);
    const isLoremIpsum = document.getElementById('loremIpsumText').checked;

    if (textLength === null) {
        alert(t('EnterValidTextLength'));
        return;
    }

    document.getElementById('randomTextTextarea').value = isLoremIpsum
        ? generateLoremIpsum(textLength)
        : generateRandomText(textLength);
    updateGeneratedTextLengthIndicator();
}

export function updateGeneratedTextLengthIndicator() {
    const textLength = getTextLength(document.getElementById('randomTextTextarea').value);
    document.getElementById('textLengthResult').textContent = textLength > 0 ? ` (${textLength})` : '';
}

export async function copyGeneratedText() {
    return copyTextToClipboard(document.getElementById('randomTextTextarea').value);
}

export function clearGeneratedText() {
    document.getElementById('randomTextTextarea').value = '';
    document.getElementById('textLength').value = '';
    document.getElementById('textLengthResult').textContent = '';
}

export async function copyHexCharacter() {
    const character = getCharacterFromHexInput(document.getElementById('hexCharText').value);

    if (character === null) {
        alert(t('EnterValidHex'));
        return false;
    }

    return copyTextToClipboard(character);
}

export function clearHexInput() {
    document.getElementById('hexCharText').value = '';
}

export function stepHexInput(delta) {
    const hexInput = document.getElementById('hexCharText');
    hexInput.value = getSteppedHexInputValue(hexInput.value, delta);
}
