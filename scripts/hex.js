const MIN_CODE_POINT = 0;
const MAX_CODE_POINT = 0x10FFFF;
// Codes reserved for the two halves of characters above 0xFFFF (emoji and so on).
// A half alone is not a character: the clipboard turns it into "\uFFFD" (a question mark in a diamond).
const SURROGATE_MIN = 0xD800;
const SURROGATE_MAX = 0xDFFF;
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
  return codePoint === null || isSurrogate(codePoint) ? null : String.fromCodePoint(codePoint);
}

// The arrows and the mouse wheel jump over the surrogate codes: 0xD7FF <-> 0xE000.
export function getSteppedHexInputValue(value, delta) {
  const codePoint = parseHexInput(value) ?? 0;
  let nextCodePoint = clampCodePoint(codePoint + delta);

  if (isSurrogate(nextCodePoint)) {
    nextCodePoint = delta > 0 ? SURROGATE_MAX + 1 : SURROGATE_MIN - 1;
  }

  return formatHexValue(nextCodePoint);
}

function isSurrogate(codePoint) {
  return codePoint >= SURROGATE_MIN && codePoint <= SURROGATE_MAX;
}

function clampCodePoint(value) {
  return Math.max(MIN_CODE_POINT, Math.min(MAX_CODE_POINT, value));
}
