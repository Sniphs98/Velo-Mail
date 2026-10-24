import path from 'node:path';
import type { FetchMessageObject } from 'imapflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../db';
import { accounts, mailboxes, messages } from '../db/schema';
import { listMailboxes, listMessages } from './queries';
import { toRow } from './sync';

let db: Database;

async function account(email: string) {
	const [{ id }] = await db
		.insert(accounts)
		.values({
			name: email,
			email,
			color: '#2563eb',
			imapHost: 'imap',
			imapPort: 993,
			imapSecurity: 'tls',
			smtpHost: 'smtp',
			smtpPort: 465,
			smtpSecurity: 'tls',
			username: email
		})
		.returning();
	return id;
}

async function mailbox(accountId: number, name: string, role: string | null = null) {
	const [{ id }] = await db
		.insert(mailboxes)
		.values({ accountId, path: name, name, role: role as never })
		.returning();
	return id;
}

async function message(mailboxId: number, uid: number, subject: string, seen = false) {
	await db.insert(messages).values({
		mailboxId,
		uid,
		subject,
		seen,
		date: new Date(Date.UTC(2026, 9, uid))
	});
}

beforeEach(() => {
	db = openDatabase(':memory:', path.resolve('drizzle'));
});

describe('listMailboxes', () => {
	it('orders folders by role, then by name, and counts unread messages', async () => {
		const a = await account('a@beispiel.de');
		const trash = await mailbox(a, 'Papierkorb', 'trash');
		await mailbox(a, 'Zeitungen');
		const inbox = await mailbox(a, 'Posteingang', 'inbox');
		await mailbox(a, 'Gesendet', 'sent');
		await mailbox(a, 'Belege');
		await message(inbox, 1, 'neu');
		await message(inbox, 2, 'gelesen', true);
		await message(trash, 1, 'weg');

		expect((await listMailboxes(db)).map((m) => [m.name, m.unread])).toEqual([
			['Posteingang', 1],
			['Gesendet', 0],
			['Papierkorb', 1],
			['Belege', 0],
			['Zeitungen', 0]
		]);
	});
});

describe('listMessages', () => {
	it('lists one folder, or the inboxes of all accounts, newest first', async () => {
		const a = await account('a@beispiel.de');
		const b = await account('b@firma.de');
		const inboxA = await mailbox(a, 'INBOX', 'inbox');
		const sentA = await mailbox(a, 'Sent', 'sent');
		const inboxB = await mailbox(b, 'INBOX', 'inbox');
		await message(inboxA, 1, 'A alt');
		await message(inboxB, 3, 'B neu');
		await message(inboxA, 2, 'A neu');
		await message(sentA, 4, 'gesendet');

		const all = await listMessages(db, { inboxes: true });
		expect(all.map((m) => [m.subject, m.accountId])).toEqual([
			['B neu', b],
			['A neu', a],
			['A alt', a]
		]);
		expect(all[0].date).toBe(Date.UTC(2026, 9, 3));
		expect((await listMessages(db, { mailboxId: sentA })).map((m) => m.subject)).toEqual([
			'gesendet'
		]);
	});
});

describe('toRow', () => {
	const fetched = (over: Partial<FetchMessageObject>) =>
		({ seq: 1, uid: 7, ...over }) as FetchMessageObject;

	it('maps envelope, flags and attachments', () => {
		const row = toRow(
			3,
			fetched({
				flags: new Set(['\\Seen', '\\Answered']),
				envelope: {
					subject: 'Angebot',
					messageId: '<m1@firma.de>',
					date: new Date('2026-10-20T10:00:00Z'),
					from: [{ name: 'Thomas Klein', address: 'Thomas@Firma.de' }],
					to: [{ address: 'du@beispiel.de' }, { name: 'Gruppe' }]
				},
				size: 1234,
				bodyStructure: {
					type: 'multipart/mixed',
					childNodes: [
						{ type: 'text/plain' },
						{ type: 'application/pdf', disposition: 'attachment' }
					]
				} as never
			})
		);
		expect(row).toMatchObject({
			mailboxId: 3,
			uid: 7,
			subject: 'Angebot',
			messageId: '<m1@firma.de>',
			fromName: 'Thomas Klein',
			fromAddress: 'thomas@firma.de',
			to: [{ address: 'du@beispiel.de' }],
			date: new Date('2026-10-20T10:00:00Z'),
			seen: true,
			answered: true,
			flagged: false,
			hasAttachments: true
		});
	});

	it("falls back to the server's arrival time for a broken date", () => {
		const internalDate = new Date('2026-10-21T08:00:00Z');
		const row = toRow(1, fetched({ envelope: { date: 'kaputt' }, internalDate }));
		expect(row.date).toEqual(internalDate);
		expect(row.subject).toBe('');
		expect(row.hasAttachments).toBe(false);
	});
});
