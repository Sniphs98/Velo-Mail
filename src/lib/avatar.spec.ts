import { describe, expect, it } from 'vitest';
import { avatarColor, initials } from './avatar';

describe('initials', () => {
	it('takes first and last name, or the address', () => {
		expect(initials('Anna Becker', 'anna@firma.de')).toBe('AB');
		expect(initials('Dr. Anna Maria Becker', null)).toBe('DB');
		expect(initials('Stadtwerke', null)).toBe('ST');
		expect(initials('"Becker, Anna"', null)).toBe('BA');
		expect(initials(null, 'jonas.weber@beispiel.de')).toBe('JO');
		expect(initials('', null)).toBe('?');
		expect(initials('Ömer Çelik', null)).toBe('ÖÇ');
	});
});

describe('avatarColor', () => {
	it('gives the same address the same color', () => {
		expect(avatarColor('anna@firma.de')).toBe(avatarColor('anna@firma.de'));
		expect(avatarColor(null)).toMatch(/^#/);
	});
});
