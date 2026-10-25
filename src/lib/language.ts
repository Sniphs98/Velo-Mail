// The page's language. Paraglide reads it from localStorage, else from the
// system (navigator.languages), else English; the main process keeps the
// same choice in the settings (electron/i18n.ts).
import type { Language } from '#lib/api.ts';
import { getLocale, localStorageKey } from '#lib/paraglide/runtime.js';

/** How the page reloads to show the new language; replaced in tests. */
export const page = { reload: () => window.location.reload() };

/** Shows the page in the chosen language; the texts are read once, so it reloads. */
export function applyLanguage(language: Language) {
	try {
		if (language === 'system') localStorage.removeItem(localStorageKey);
		else localStorage.setItem(localStorageKey, language);
	} catch {
		// Storage off: the language lasts until the app closes.
	}
	page.reload();
}

/** For Intl: "de-DE" or "en-US". */
export function intlLocale() {
	return getLocale() === 'de' ? 'de-DE' : 'en-US';
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** A date format in the current language, made once per language and options. */
export function dateFormat(options: Intl.DateTimeFormatOptions) {
	const key = intlLocale() + JSON.stringify(options);
	let format = formats.get(key);
	if (!format) formats.set(key, (format = new Intl.DateTimeFormat(intlLocale(), options)));
	return format;
}

/** "09:42" in German, "9:42 AM" in English. */
export function timeFormat() {
	return dateFormat({ hour: getLocale() === 'de' ? '2-digit' : 'numeric', minute: '2-digit' });
}
