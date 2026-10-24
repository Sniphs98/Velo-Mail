import { describe, expect, it } from 'vitest';
import type { OutgoingMessage } from '../../src/lib/api';
import { buildMessage, parseRecipients, savesSentCopy } from './outgoing';

const message = (over: Partial<OutgoingMessage> = {}): OutgoingMessage => ({
	accountId: 1,
	to: 'Anna Becker <anna@firma.de>',
	cc: '',
	bcc: 'geheim@beispiel.de',
	subject: 'Re: Planung',
	text: 'Passt für mich.',
	attachments: [],
	...over
});

describe('parseRecipients', () => {
	it('reads names, plain addresses and groups', () => {
		expect(parseRecipients('Anna Becker <anna@firma.de>, jonas@beispiel.de')).toEqual([
			{ name: 'Anna Becker', address: 'anna@firma.de' },
			{ address: 'jonas@beispiel.de' }
		]);
		expect(parseRecipients('Team: a@x.de, b@x.de;')).toEqual([
			{ address: 'a@x.de' },
			{ address: 'b@x.de' }
		]);
		expect(parseRecipients('')).toEqual([]);
	});

	it('names the entry that is not an address', () => {
		expect(() => parseRecipients('anna@firma.de, Jonas')).toThrow('Keine gültige Adresse: Jonas');
	});
});

describe('buildMessage', () => {
	const from = { name: 'Du', address: 'du@beispiel.de' };

	it('keeps the conversation headers and hides Bcc from the recipients', async () => {
		const built = await buildMessage(
			from,
			message({ inReplyTo: '<p2@firma.de>', references: ['<p1@firma.de>', '<p2@firma.de>'] })
		);
		const raw = built.raw.toString();
		expect(raw).toMatch(/^In-Reply-To: <p2@firma\.de>$/m);
		expect(raw).toMatch(/^References: <p1@firma\.de> <p2@firma\.de>$/m);
		expect(raw).toMatch(/^Subject: Re: Planung$/m);
		expect(raw).not.toMatch(/^Bcc:/m);
		expect(built.envelope).toEqual({
			from: 'du@beispiel.de',
			to: ['anna@firma.de', 'geheim@beispiel.de']
		});
		expect(built.messageId).toMatch(/^<.+@.+>$/);
	});

	it('keeps Bcc in drafts and allows them without recipients', async () => {
		expect((await buildMessage(from, message(), { draft: true })).raw.toString()).toMatch(
			/^Bcc: geheim@beispiel\.de$/m
		);
		await expect(
			buildMessage(from, message({ to: '', bcc: '' }), { draft: true })
		).resolves.toBeDefined();
		await expect(buildMessage(from, message({ to: '', bcc: '' }))).rejects.toThrow(
			'keinen Empfänger'
		);
	});
});

describe('savesSentCopy', () => {
	it('knows Gmail stores sent messages itself', () => {
		const settings = { smtpHost: 'smtp.gmail.com' } as never;
		expect(savesSentCopy(settings)).toBe(true);
		expect(savesSentCopy({ smtpHost: 'mail.gmx.net' } as never)).toBe(false);
	});
});
