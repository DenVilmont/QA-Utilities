export const MAX_TEXT_LENGTH = 100000;

const RANDOM_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const LOREM_OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
  'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim',
  'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip',
  'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
  'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id',
  'est', 'laborum', 'integer', 'vitae', 'justo', 'eget', 'magna', 'fermentum', 'iaculis', 'eu',
  'facilisis', 'mauris', 'pharetra', 'ultrices', 'neque', 'ornare', 'aenean', 'euismod', 'elementum', 'nisl',
  'purus', 'viverra', 'accumsan', 'lacus', 'vel', 'pellentesque', 'habitant', 'morbi', 'tristique', 'senectus'
];

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getRandomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function createLoremSentence() {
  const wordCount = getRandomInt(6, 14);
  const words = Array.from({length: wordCount}, () => getRandomItem(LOREM_WORDS));

  if (wordCount > 8 && Math.random() < 0.5) {
    const commaIndex = getRandomInt(2, wordCount - 4);
    words[commaIndex] += ',';
  }

  const sentence = words.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

export function getTextLength(text) {
  return typeof text === 'string' ? text.length : 0;
}

export function generateRandomText(length) {
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += RANDOM_CHARACTERS.charAt(Math.floor(Math.random() * RANDOM_CHARACTERS.length));
  }

  return result;
}

// Returns Lorem ipsum text of exactly `length` characters.
// The text never ends with a space, so trimming in the tested app does not change its length.
export function generateLoremIpsum(length) {
  if (length <= 0) {
    return '';
  }

  const sentences = [LOREM_OPENING];
  let currentLength = LOREM_OPENING.length;

  while (currentLength < length) {
    const sentence = createLoremSentence();
    sentences.push(sentence);
    currentLength += sentence.length + 1;
  }

  const text = sentences.join(' ').slice(0, length);

  return text.endsWith(' ') ? text.slice(0, -1) + '.' : text;
}
