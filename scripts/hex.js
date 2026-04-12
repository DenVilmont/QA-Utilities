const MIN_HEX_STEP_VALUE = 0;
const MAX_HEX_STEP_VALUE = 0xFF;

export function parseHexInput(value) {
  const parsedValue = Number.parseInt(`${value ?? ''}`.trim(), 16);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

export function formatHexByte(value) {
  const clampedValue = clampHexByte(value);
  return `0x${clampedValue.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function getCharacterFromHexInput(value) {
  return String.fromCharCode(parseHexInput(value));
}

export function getSteppedHexInputValue(value, delta) {
  return formatHexByte(clampHexByte(parseHexInput(value) + delta));
}

function clampHexByte(value) {
  return Math.max(MIN_HEX_STEP_VALUE, Math.min(MAX_HEX_STEP_VALUE, value));
}
