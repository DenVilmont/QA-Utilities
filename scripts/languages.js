import {DEFAULT_LANGUAGE, getLanguage, setLanguage} from './storage.js';

const SUPPORTED_LANGUAGES = new Set(['en', 'zh', 'fr', 'de', 'pt', 'ru', 'ro', 'es']);

let currentLanguage = normalizeLanguage(getLanguage());
let currentMessages = {};
let englishMessages = {};
let latestLoadRequestId = 0;

const messageCache = new Map();

function normalizeLanguage(lang) {
    return SUPPORTED_LANGUAGES.has(lang) ? lang : DEFAULT_LANGUAGE;
}

function normalizeMessages(messages) {
    return Object.fromEntries(
        Object.entries(messages || {})
            .map(([key, value]) => [key, typeof value === 'string' ? value : value?.message])
            .filter(([, value]) => typeof value === 'string')
    );
}

async function fetchMessages(lang) {
    const normalizedLang = normalizeLanguage(lang);

    if (!messageCache.has(normalizedLang)) {
        const fetchPromise = fetch(chrome.runtime.getURL(`_locales/${normalizedLang}/messages.json`))
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load locale "${normalizedLang}": ${response.status}`);
                }

                return response.json();
            })
            .then(normalizeMessages)
            .catch(error => {
                console.error(`Failed to load locale messages for "${normalizedLang}".`, error);
                messageCache.delete(normalizedLang);
                return null;
            });

        messageCache.set(normalizedLang, fetchPromise);
    }

    return messageCache.get(normalizedLang);
}

async function ensureEnglishMessages() {
    const messages = await fetchMessages(DEFAULT_LANGUAGE);
    englishMessages = messages || {};
    return englishMessages;
}

function collectTranslatableElements(root, selector) {
    const elements = [];

    if (root?.nodeType === Node.ELEMENT_NODE && root.matches(selector)) {
        elements.push(root);
    }

    if (typeof root?.querySelectorAll === 'function') {
        elements.push(...root.querySelectorAll(selector));
    }

    return elements;
}

function applyTextTranslations(root) {
    collectTranslatableElements(root, '[data-i18n]').forEach(element => {
        element.textContent = t(element.getAttribute('data-i18n'));
    });
}

function applyPlaceholderTranslations(root) {
    collectTranslatableElements(root, '[data-i18n-placeholder]').forEach(element => {
        element.setAttribute('placeholder', t(element.getAttribute('data-i18n-placeholder')));
    });
}

function applyTitleTranslations(root) {
    collectTranslatableElements(root, '[data-i18n-title]').forEach(element => {
        element.setAttribute('title', t(element.getAttribute('data-i18n-title')));
    });
}

function applyAriaLabelTranslations(root) {
    collectTranslatableElements(root, '[data-i18n-aria-label]').forEach(element => {
        element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria-label')));
    });
}

function applyDocumentTitle() {
    const titleElement = document.querySelector('[data-i18n-document-title]');

    if (!titleElement) {
        return;
    }

    document.title = t(titleElement.getAttribute('data-i18n-document-title'));
}

export function getCurrentLanguage() {
    return currentLanguage;
}

export async function loadMessages(lang) {
    const normalizedLang = normalizeLanguage(lang);
    const requestId = ++latestLoadRequestId;
    const englishPromise = ensureEnglishMessages();
    const languagePromise = normalizedLang === DEFAULT_LANGUAGE
        ? englishPromise
        : fetchMessages(normalizedLang);

    const [languageMessages, fallbackMessages] = await Promise.all([languagePromise, englishPromise]);

    if (requestId !== latestLoadRequestId) {
        return false;
    }

    currentLanguage = normalizedLang;
    currentMessages = languageMessages || {};
    englishMessages = fallbackMessages || {};

    return true;
}

export async function setCurrentLanguage(lang) {
    const normalizedLang = normalizeLanguage(lang);
    setLanguage(normalizedLang);
    return loadMessages(normalizedLang);
}

export function t(key) {
    if (!key) {
        return '';
    }

    return currentMessages[key] || englishMessages[key] || key;
}

export function applyTranslations(root = document) {
    applyTextTranslations(root);
    applyPlaceholderTranslations(root);
    applyTitleTranslations(root);
    applyAriaLabelTranslations(root);
    if (root === document) {
        applyDocumentTitle();
    }
}
