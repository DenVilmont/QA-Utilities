import {t} from './languages.js';
import {copyTextToClipboard} from './clipboard.js';
import {getCharacterFromHexInput, getSteppedHexInputValue} from './hex.js';
import {generateRandomText, getTextLength} from './text.js';

export async function generateText() {
    const textLength = Number.parseInt(document.getElementById('textLength').value, 10);
    const isMeaningful = document.getElementById('meaningfulText').checked;

    if (Number.isNaN(textLength) || textLength <= 0) {
        alert(t('EnterValidPositiveNumber'));
        return;
    }

    const text = isMeaningful ? await generateMeaningfulTextFromBaconIpsum(textLength) : generateRandomText(textLength);
    document.getElementById('randomTextTextarea').value = text;
    updateGeneratedTextLengthIndicator();
}

export async function generateMeaningfulTextFromBaconIpsum(length) {
    let result = '';

    try {
        while (result.length < length) {
            const response = await fetch('https://baconipsum.com/api/?type=meat-and-filler&sentences=40');
            const data = await response.json();
            result += ' ' + data.join(' ');
        }

        return result.replace(/\s+/g, ' ').trim().slice(0, length);

    } catch (err) {
        console.warn('Bacon Ipsum API failed, using local fallback.', err);
        return generateLocalMeaningfulText(length);
    }
}

function generateLocalMeaningfulText(length) {
    const phrases = [
        "Useful utilities for testing.",
        "Text generation in progress.",
        "Clipboard and storage tools.",
        "Everything is working fine.",
        "Enhance your workflow today.",
        "Random characters are fun.",
        "Need more meaningful words?"
    ];

    let result = '';
    while (result.length < length) {
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        if (result.length + phrase.length + 1 <= length) {
            result += (result ? ' ' : '') + phrase;
        } else break;
    }

    return result.trim().slice(0, length);
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
    return copyTextToClipboard(getCharacterFromHexInput(document.getElementById('hexCharText').value));
}

export function clearHexInput() {
    document.getElementById('hexCharText').value = '';
}

export function stepHexInput(delta) {
    const hexInput = document.getElementById('hexCharText');
    hexInput.value = getSteppedHexInputValue(hexInput.value, delta);
}
