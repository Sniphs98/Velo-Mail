import { describe, expect, it } from 'vitest';
import type { SearchQuery } from '../../src/lib/api';
import { noFilters } from '../../src/lib/search';
import { toFtsQuery } from './search';
import { serverCriteria } from './sync';

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

describe('serverCriteria', () => {
	const query = (over: Partial<SearchQuery>): SearchQuery => ({ ...noFilters, text: '', ...over });

	it('asks the server for words, sender, days and unread', () => {
		expect(
			serverCriteria(
				query({
					text: ' Rechnung ',
					from: 'jonas',
					since: Date.UTC(2026, 9, 1),
					until: Date.UTC(2026, 9, 31),
					unread: true
				})
			)
		).toEqual({
			text: 'Rechnung',
			from: 'jonas',
			since: new Date(Date.UTC(2026, 9, 1)),
			// BEFORE is a whole day, so the last day still counts.
			before: new Date(Date.UTC(2026, 10, 1)),
			seen: false
		});
	});

	it('has nothing to ask for an empty search or one the server cannot narrow', () => {
		expect(serverCriteria(query({}))).toBeNull();
		expect(serverCriteria(query({ attachments: true, accounts: [1] }))).toBeNull();
	});
});
