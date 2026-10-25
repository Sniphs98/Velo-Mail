// Most tests check the German texts, as they were written first; tests of the
// English ones switch over themselves (inLocale).
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';

let current: 'en' | 'de' = 'de';
overwriteGetLocale(() => current);

/** Runs `use` with the texts in `locale`, then back to German. */
export async function inLocale<T>(locale: 'en' | 'de', use: () => T | Promise<T>): Promise<T> {
	current = locale;
	try {
		return await use();
	} finally {
		current = 'de';
	}
}
