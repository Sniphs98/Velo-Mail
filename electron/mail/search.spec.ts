import { describe, expect, it } from 'vitest';
import { toFtsQuery } from './search';

describe('toFtsQuery', () => {
	it('matches every word as a prefix', () => {
		expect(toFtsQuery('plan woche')).toBe('"plan"* "woche"*');
	});

	it('keeps quoted phrases and addresses together', () => {
		expect(toFtsQuery('"nächste Woche" anna@firma.de')).toBe('"nächste Woche"* "anna@firma.de"*');
	});

	it('limits words to sender or subject', () => {
		expect(toFtsQuery('von:anna Betreff:"neues Angebot" rechnung')).toBe(
			'sender : "anna"* subject : "neues Angebot"* "rechnung"*'
		);
		// Unknown fields are just words.
		expect(toFtsQuery('an:jonas')).toBe('"an:jonas"*');
	});

	it('cannot break the query syntax', () => {
		expect(toFtsQuery('a" OR b')).toBe('"a"* "OR"* "b"*');
		expect(toFtsQuery('NEAR( * ^ -')).toBe('"NEAR("*');
		expect(toFtsQuery('   ')).toBeNull();
		expect(toFtsQuery('"')).toBeNull();
	});
});
