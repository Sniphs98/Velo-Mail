import { describe, expect, it } from 'vitest';
import type { ReplySource } from '#lib/api.ts';
import { formatAddress, prefixSubject, replyDraft, swapSignature, withSignature } from './compose';

const source = (over: Partial<ReplySource> = {}): ReplySource => ({
	messageId: '<p2@firma.de>',
	references: ['<p1@firma.de>'],
	from: { name: 'Anna Becker', address: 'anna@firma.de' },
	to: [{ name: 'Du', address: 'du@beispiel.de' }, { address: 'jonas@beispiel.de' }],
	cc: [{ name: 'Becker, Team', address: 'team@firma.de' }],
	subject: 'Planung',
	date: Date.UTC(2026, 9, 24, 7, 42),
	text: 'Hi,\nkannst du drüberschauen?\n> alter Text',
	accountId: 1,
	accountEmail: 'Du@Beispiel.de',
	uid: 7,
	isDraft: false,
	...over
});

describe('prefixSubject', () => {
	it('adds Re: or Fwd: once, also after German prefixes', () => {
		expect(prefixSubject('Planung', 'Re')).toBe('Re: Planung');
		expect(prefixSubject('RE: Planung', 'Re')).toBe('RE: Planung');
		expect(prefixSubject('AW: Planung', 'Re')).toBe('AW: Planung');
		expect(prefixSubject('WG: Planung', 'Fwd')).toBe('WG: Planung');
		expect(prefixSubject('Re: Planung', 'Fwd')).toBe('Fwd: Re: Planung');
	});
});

describe('formatAddress', () => {
	it('quotes names that need it', () => {
		expect(formatAddress({ name: 'Becker, Team', address: 't@f.de' })).toBe(
			'"Becker, Team" <t@f.de>'
		);
		expect(formatAddress({ address: 't@f.de' })).toBe('t@f.de');
	});
});

describe('replyDraft', () => {
	it('replies to the sender with a quote and the conversation headers', () => {
		const draft = replyDraft(source(), 'reply', 42);
		expect(draft).toMatchObject({
			accountId: 1,
			to: 'Anna Becker <anna@firma.de>',
			cc: '',
			subject: 'Re: Planung',
			replyTo: 42,
			inReplyTo: '<p2@firma.de>',
			references: ['<p1@firma.de>', '<p2@firma.de>']
		});
		expect(draft.text).toContain(
			'schrieb Anna Becker:\n> Hi,\n> kannst du drüberschauen?\n>> alter Text'
		);
	});

	it('replies to all without yourself and without duplicates', () => {
		const draft = replyDraft(
			source({
				cc: [{ address: 'anna@firma.de' }, { name: 'Becker, Team', address: 'team@firma.de' }]
			}),
			'replyAll',
			42
		);
		expect(draft.to).toBe('Anna Becker <anna@firma.de>, jonas@beispiel.de');
		expect(draft.cc).toBe('"Becker, Team" <team@firma.de>');
	});

	it('replies to the recipients of your own message', () => {
		const draft = replyDraft(source({ from: { address: 'du@beispiel.de' } }), 'reply', 42);
		expect(draft.to).toBe('jonas@beispiel.de');
	});

	it('answers a note to yourself to yourself', () => {
		const draft = replyDraft(
			source({ from: { address: 'du@beispiel.de' }, to: [{ address: 'du@beispiel.de' }], cc: [] }),
			'replyAll',
			42
		);
		expect(draft.to).toBe('du@beispiel.de');
		expect(draft.cc).toBe('');
	});

	it('forwards with the original header and no recipients', () => {
		const draft = replyDraft(source(), 'forward', 42);
		expect(draft.to).toBe('');
		expect(draft.subject).toBe('Fwd: Planung');
		expect(draft.text).toContain('Von: Anna Becker <anna@firma.de>');
		expect(draft.text).toContain('Betreff: Planung');
		expect(draft.replyTo).toBeUndefined();
	});
});

describe('signatures', () => {
	it('puts the signature below the text and above a quote', () => {
		expect(withSignature('', 'Grüße\nDu\n')).toBe('\n\n-- \nGrüße\nDu');
		expect(withSignature('\n\nAm Montag schrieb Anna:\n> Hallo\n', 'Du')).toBe(
			'\n\n-- \nDu\n\nAm Montag schrieb Anna:\n> Hallo\n'
		);
		expect(withSignature('\n\n> Hallo', '  ')).toBe('\n\n> Hallo');
	});

	it('exchanges the signature when the account changes', () => {
		const text = 'Hallo Anna,\n\n-- \nPrivat';
		expect(swapSignature(text, 'Privat', 'Firma GmbH')).toBe('Hallo Anna,\n\n-- \nFirma GmbH');
		expect(swapSignature(text, 'Privat', '')).toBe('Hallo Anna,');
		expect(swapSignature('Hallo', '', 'Firma')).toBe('Hallo');
		expect(swapSignature('\n\n> Zitat', '', 'Firma')).toBe('\n\n-- \nFirma\n\n> Zitat');
		expect(swapSignature('\n\n-- \nPrivat\n\n> Zitat', 'Privat', 'Firma')).toBe(
			'\n\n-- \nFirma\n\n> Zitat'
		);
		// Edited signatures stay.
		expect(swapSignature('Hallo\n\n-- \nPrivat, Tel. 123', 'Privat, Tel. 1', 'Firma')).toBe(
			'Hallo\n\n-- \nPrivat, Tel. 123'
		);
	});
});
