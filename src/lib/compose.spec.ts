import { describe, expect, it } from 'vitest';
import type { ReplySource } from '#lib/api.ts';
import { inLocale } from '#lib/testing/german.ts';
import { formatAddress, prefixSubject, replyDraft } from './compose';

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
	html: null,
	attachments: [{ id: 3, filename: 'plan.pdf', contentType: 'application/pdf', size: 1200 }],
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
		expect(draft.html).toMatch(
			/^<p>Am .+ schrieb Anna Becker:<\/p><blockquote><p>Hi,<br>kannst du drüberschauen\?<br>&gt; alter Text<\/p><\/blockquote>$/
		);
		expect(draft.forwarded).toEqual([]);
	});

	it('quotes in the language of the app', async () => {
		await inLocale('en', () => {
			expect(replyDraft(source(), 'reply', 42).html).toMatch(/^<p>On .+, Anna Becker wrote:<\/p>/);
			expect(replyDraft(source(), 'forward', 42).html).toContain('Forwarded message');
		});
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
		expect(draft.html).toContain('Von: Anna Becker &lt;anna@firma.de&gt;<br>');
		expect(draft.html).toContain('Betreff: Planung');
		expect(draft.html).toContain('<p>Hi,<br>kannst du drüberschauen?');
		expect(draft.forwarded).toEqual([expect.objectContaining({ id: 3, filename: 'plan.pdf' })]);
		expect(draft.replyTo).toBeUndefined();
	});
});
