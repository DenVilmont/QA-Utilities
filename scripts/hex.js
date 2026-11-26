const MIN_CODE_POINT = 0;
const MAX_CODE_POINT = 0x10FFFF;
const HEX_INPUT_PATTERN = /^(0x)?[0-9a-f]+$/i;

// Returns the code point written in the input, or null if the input is not a valid hex number.
export function parseHexInput(value) {
  const trimmedValue = `${value ?? ''}`.trim();

  if (!HEX_INPUT_PATTERN.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number.parseInt(trimmedValue, 16);
  return parsedValue <= MAX_CODE_POINT ? parsedValue : null;
}

export function formatHexValue(value) {
  return `0x${clampCodePoint(value).toString(16).toUpperCase().padStart(2, '0')}`;
}

// Returns the character for the input, or null if the input is not valid.
export function getCharacterFromHexInput(value) {
  const codePoint = parseHexInput(value);
  return codePoint === null ? null : String.fromCodePoint(codePoint);
}

export function getSteppedHexInputValue(value, delta) {
  const codePoint = parseHexInput(value) ?? 0;
  return formatHexValue(codePoint + delta);
}

function clampCodePoint(value) {
  return Math.max(MIN_CODE_POINT, Math.min(MAX_CODE_POINT, value));
}
