/*
export function generateText() {
    const textLength = parseInt(document.getElementById('textLength').value);
    if (isNaN(textLength) || textLength <= 0) {
        alert(chrome.i18n.getMessage("EnterValidPositiveNumber"));
        return;
    }
    const generatedText = generateRandomText(textLength);
    document.getElementById('randomTextTextarea').value = generatedText;
};
*/
export async function generateText() {
    const textLength = parseInt(document.getElementById('textLength').value);
    const isMeaningful = document.getElementById('meaningfulText').checked;

    if (isNaN(textLength) || textLength <= 0) {
        alert(chrome.i18n.getMessage("EnterValidPositiveNumber"));
        return;
    }
    const text = isMeaningful ? await generateMeaningfulTextFromBaconIpsum(textLength) : generateRandomText(textLength);
    document.getElementById('randomTextTextarea').value = text;
    countTheLengthOfTheText();
};

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
};

function generateRandomText(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

export function generateHexSymbol(charCode) {
    const symbol = String.fromCharCode(charCode);  
    const hexValue = symbol.toString(16).toUpperCase();
    return hexValue;
};

export function countTheLengthOfTheText(){
    const textLength = document.getElementById('randomTextTextarea').value.length;
    if (textLength > 0) {
        document.getElementById('textLengthResult').textContent = ' (' + textLength + ')';
    } else {
        document.getElementById('textLengthResult').textContent = '';
    }
}

export function updateHex(delta) {
    const hexInput = document.getElementById('hexCharText');
    let currentValue = hexInput.value.trim();
    let hexNumber = parseInt(currentValue, 16);
  
    if (isNaN(hexNumber)) hexNumber = 0;
    hexNumber = Math.max(0, Math.min(0xFF, hexNumber + delta));
  
    hexInput.value = `0x${hexNumber.toString(16).toUpperCase().padStart(2, "0")}`;
  }