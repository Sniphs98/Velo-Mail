import { describe, expect, it } from 'vitest';
import { localeFor } from './i18n';

describe('localeFor', () => {
	it('takes the choice, else German for a German system, else English', () => {
		expect(localeFor('en', 'de-DE')).toBe('en');
		expect(localeFor('de', 'en-US')).toBe('de');
		expect(localeFor('system', 'de-AT')).toBe('de');
		expect(localeFor('system', 'fr')).toBe('en');
	});
});
