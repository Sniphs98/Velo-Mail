// The language of the main process's texts (notifications, tray, errors):
// the one chosen in the settings, else the system's. The page decides the
// same way (src/lib/language.ts), so both always agree.
import type { Language } from '../src/lib/api';
import { overwriteGetLocale } from '../src/lib/paraglide/runtime.js';

export type Locale = 'en' | 'de';

/** English unless the choice or the system says German. */
export function localeFor(language: Language, system: string): Locale {
	if (language !== 'system') return language;
	return system.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let current: Locale = 'en';

/** Makes the main process's texts follow the setting (call on start and on change). */
export function useLanguage(language: Language, system: string) {
	current = localeFor(language, system);
	overwriteGetLocale(() => current);
}
