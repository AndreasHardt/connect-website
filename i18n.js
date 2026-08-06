const supportedLanguages = ['de', 'en', 'fr'];

function requestedLanguage() {
  const parameter = new URLSearchParams(window.location.search).get('lang')?.toLowerCase();
  return supportedLanguages.includes(parameter) ? parameter : 'de';
}

function markActiveLanguage(language) {
  for (const link of document.querySelectorAll('.language-switcher [data-lang]')) {
    const active = link.dataset.lang === language;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function applyMessages(messages) {
  if (messages['meta.title']) document.title = messages['meta.title'];
  const description = document.querySelector('meta[name="description"]');
  if (description && messages['meta.description']) description.content = messages['meta.description'];

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const value = messages[element.dataset.i18n];
    if (typeof value === 'string') element.textContent = value;
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    const value = messages[element.dataset.i18nAriaLabel];
    if (typeof value === 'string') element.setAttribute('aria-label', value);
  }
  for (const element of document.querySelectorAll('[data-i18n-href]')) {
    const value = messages[element.dataset.i18nHref];
    if (typeof value === 'string') element.setAttribute('href', value);
  }
}

const language = requestedLanguage();
markActiveLanguage(language);

try {
  const catalogUrl = new URL(`./i18n/${language}.json`, import.meta.url);
  const response = await fetch(catalogUrl, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Sprachkatalog konnte nicht geladen werden: ${response.status}`);
  const messages = await response.json();
  document.documentElement.lang = language;
  applyMessages(messages);
  document.documentElement.dataset.i18nStatus = 'ready';
} catch {
  document.documentElement.lang = 'de';
  document.documentElement.dataset.i18nStatus = 'fallback';
  markActiveLanguage('de');
}
