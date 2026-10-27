import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { FetchMessageObject } from 'imapflow';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SearchFilters, SearchQuery } from '../../src/lib/api';
import { noFilters } from '../../src/lib/search';
import { openDatabase, type Database } from '../db';
import { accounts, mailboxes, messageBodies, messages } from '../db/schema';
import {
	findBody,
	listMailboxes,
	listMessages,
	listThread,
	messagesFromSender,
	newestUid,
	newsletterSenders,
	searchMessages,
	listSenderRules,
	listTrustedSenders,
	setSenderRule,
	suggestAddresses,
	trustSender,
	untrustSender,
	unreadInInboxes,
	unseenAbove,
	unseenListed
} from './queries';
import { newsletterInfo, parseReferences, threadKey, toRow } from './sync';

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

async function message(
	mailboxId: number,
	uid: number,
	subject: string,
	seen = false,
	thread?: { id: string; threadId: string }
) {
	const [row] = await db
		.insert(messages)
		.values({
			mailboxId,
			uid,
			subject,
			seen,
			date: new Date(Date.UTC(2026, 9, uid)),
			messageId: thread?.id,
			threadId: thread?.threadId,
			fromAddress: 'anna@firma.de'
		})
		.returning();
	return row.id;
}

beforeEach(() => {
	db = openDatabase(':memory:', path.resolve('drizzle'));
});

const words = (text: string, filters: Partial<SearchFilters> = {}): SearchQuery => ({
	...noFilters,
	text,
	...filters
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

describe('newsletters', () => {
	/** A message from `from`, a newsletter by its headers or not. */
	async function mail(
		box: number,
		uid: number,
		from: string,
		newsletter: boolean | null,
		seen = false
	) {
		const id = await message(box, uid, `${from} ${uid}`, seen);
		await db
			.update(messages)
			.set({
				fromAddress: from,
				newsletter,
				unsubscribe: newsletter ? `https://${from.split('@')[1]}/stop` : null
			})
			.where(eq(messages.id, id));
		return id;
	}

	it('splits the inbox into tabs and counts their unread mail', async () => {
		const a = await account('a@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		await mail(inbox, 1, 'anna@firma.de', false);
		await mail(inbox, 2, 'news@shop.de', true);
		await mail(inbox, 3, 'jonas@verein.de', null);
		await mail(inbox, 4, 'news@shop.de', true, true);
		const subjects = async (tab?: 'primary' | 'newsletters') =>
			(await listMessages(db, { inboxes: true, tab })).map((m) => m.subject);

		expect(await subjects('primary')).toEqual(['jonas@verein.de 3', 'anna@firma.de 1']);
		expect(await subjects('newsletters')).toEqual(['news@shop.de 4', 'news@shop.de 2']);
		expect(await subjects()).toHaveLength(4);
		expect(await listMailboxes(db)).toMatchObject([{ unread: 3, unreadNewsletters: 1 }]);
	});

	it('finds the unread mail of a tab or folder to mark all read', async () => {
		const a = await account('a@beispiel.de');
		const b = await account('b@beispiel.de');
		const inboxA = await mailbox(a, 'INBOX', 'inbox');
		const inboxB = await mailbox(b, 'INBOX', 'inbox');
		const archive = await mailbox(a, 'Archiv', 'archive');
		const anna = await mail(inboxA, 1, 'anna@firma.de', false);
		const news = await mail(inboxA, 2, 'news@shop.de', true);
		await mail(inboxA, 3, 'news@shop.de', true, true);
		const otherNews = await mail(inboxB, 4, 'news@shop.de', true);
		const archived = await mail(archive, 5, 'anna@firma.de', false);
		const ids = async (query: Parameters<typeof unseenListed>[1]) =>
			(await unseenListed(db, query)).map((row) => row.id).sort();

		expect(await ids({ inboxes: true, tab: 'newsletters' })).toEqual([news, otherNews]);
		expect(await ids({ inboxes: true, tab: 'primary' })).toEqual([anna]);
		expect(await ids({ mailboxId: inboxA, tab: 'newsletters' })).toEqual([news]);
		expect(await ids({ mailboxId: archive })).toEqual([archived]);
		expect((await unseenListed(db, { mailboxId: inboxB }))[0]).toMatchObject({
			uid: 4,
			mailbox: { id: inboxB, accountId: b, path: 'INBOX' }
		});
	});

	it("files a sender's mail by its rule, whatever the headers say", async () => {
		const a = await account('a@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		await mail(inbox, 1, 'rechnung@shop.de', true);
		await mail(inbox, 2, 'info@verein.de', false);
		const tab = async (name: 'primary' | 'newsletters') =>
			(await listMessages(db, { inboxes: true, tab: name })).map((m) => m.fromAddress);

		await setSenderRule(db, 'Rechnung@Shop.de', 'primary');
		await setSenderRule(db, 'info@verein.de', 'newsletter');
		expect(await tab('primary')).toEqual(['rechnung@shop.de']);
		expect(await tab('newsletters')).toEqual(['info@verein.de']);
		expect((await unseenAbove(db, inbox, 0)).map((m) => [m.fromAddress, m.newsletter])).toEqual([
			['info@verein.de', true],
			['rechnung@shop.de', false]
		]);

		expect(await listSenderRules(db)).toEqual([
			{ address: 'info@verein.de', rule: 'newsletter' },
			{ address: 'rechnung@shop.de', rule: 'primary' }
		]);

		// Back to the headers.
		await setSenderRule(db, 'rechnung@shop.de', null);
		await setSenderRule(db, 'info@verein.de', 'primary');
		expect(await tab('newsletters')).toEqual(['rechnung@shop.de']);
	});

	it('lists newsletter senders by amount, and their mail to tidy up', async () => {
		const a = await account('a@beispiel.de');
		const b = await account('b@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		const archive = await mailbox(a, 'Archiv', 'archive');
		const trash = await mailbox(a, 'Papierkorb', 'trash');
		const inboxB = await mailbox(b, 'INBOX', 'inbox');
		await mail(inbox, 1, 'news@shop.de', true);
		await mail(inbox, 2, 'news@shop.de', true, true);
		const archived = await mail(archive, 3, 'news@shop.de', true, true);
		await mail(trash, 4, 'news@shop.de', true);
		const club = await mail(inbox, 5, 'club@verein.de', true);
		await mail(inbox, 6, 'anna@firma.de', false);
		await mail(inboxB, 7, 'deals@markt.de', true);

		const senders = await newsletterSenders(db, [a]);
		expect(senders).toEqual([
			{
				address: 'news@shop.de',
				name: null,
				count: 3,
				unread: 1,
				latest: Date.UTC(2026, 9, 3),
				messageId: archived,
				accountId: a,
				unsubscribe: 'https://shop.de/stop',
				rule: null
			},
			expect.objectContaining({ address: 'club@verein.de', count: 1, messageId: club })
		]);
		expect((await newsletterSenders(db, [])).map((s) => s.address)).toContain('deals@markt.de');

		// Archiving takes them from the inbox; the trash also from the archive.
		expect(await messagesFromSender(db, 'news@shop.de', [a], 'archive')).toHaveLength(2);
		expect(await messagesFromSender(db, 'News@Shop.de', [a], 'trash')).toHaveLength(3);
		expect(await messagesFromSender(db, 'news@shop.de', [b], 'trash')).toEqual([]);
	});
});

describe('new mail', () => {
	it('finds unread messages above a UID and counts unread inbox mail', async () => {
		const a = await account('a@beispiel.de');
		const b = await account('b@firma.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		const sent = await mailbox(a, 'Sent', 'sent');
		const other = await mailbox(b, 'INBOX', 'inbox');
		expect(await newestUid(db, inbox)).toBe(0);
		await message(inbox, 4, 'alt');
		expect(await newestUid(db, inbox)).toBe(4);
		await message(inbox, 5, 'neu');
		await message(inbox, 6, 'schon gelesen', true);
		await message(inbox, 7, 'neuer');
		await message(sent, 8, 'gesendet');
		await message(other, 9, 'anderes Konto');

		expect((await unseenAbove(db, inbox, 4)).map((m) => m.subject)).toEqual(['neuer', 'neu']);
		expect(await unreadInInboxes(db)).toBe(4);
	});
});

describe('conversations', () => {
	it('lists one row per conversation with its size, read only if all are read', async () => {
		const a = await account('a@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		await message(inbox, 1, 'Planung', true, { id: '<1@x>', threadId: '<1@x>' });
		await message(inbox, 3, 'Re: Planung', false, { id: '<3@x>', threadId: '<1@x>' });
		await message(inbox, 2, 'Anderes', true);

		const list = await listMessages(db, { inboxes: true });
		expect(list.map((m) => [m.subject, m.threadSize, m.seen])).toEqual([
			['Re: Planung', 2, false],
			['Anderes', 1, true]
		]);
	});

	it('shows the whole conversation across folders, each message once', async () => {
		const a = await account('a@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		const sent = await mailbox(a, 'Sent', 'sent');
		const archive = await mailbox(a, 'Archiv', 'archive');
		const first = await message(inbox, 1, 'Planung', true, { id: '<1@x>', threadId: '<1@x>' });
		await message(sent, 2, 'Re: Planung', true, { id: '<2@x>', threadId: '<1@x>' });
		await message(archive, 1, 'Planung', true, { id: '<1@x>', threadId: '<1@x>' });
		await message(inbox, 3, 'Fremd', true, { id: '<9@x>', threadId: '<9@x>' });

		expect((await listThread(db, first)).map((m) => m.subject)).toEqual(['Planung', 'Re: Planung']);
		const lonely = await message(inbox, 4, 'Ohne ID');
		expect((await listThread(db, lonely)).map((m) => m.subject)).toEqual(['Ohne ID']);
	});
});

describe('searchMessages', () => {
	it('finds by subject, sender and content across folders, newest first', async () => {
		const a = await account('a@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		const archive = await mailbox(a, 'Archiv', 'archive');
		const offer = await message(inbox, 1, 'Angebot Relaunch');
		await message(archive, 2, 'Re: Angebot Relaunch');
		const invoice = await message(inbox, 3, 'Rechnung Oktober');
		await db
			.insert(messageBodies)
			.values({ messageId: invoice, text: 'Bitte überweisen Sie bis Freitag' });

		expect((await searchMessages(db, words('angeb'))).map((m) => m.subject)).toEqual([
			'Re: Angebot Relaunch',
			'Angebot Relaunch'
		]);
		expect((await searchMessages(db, words('uberweisen'))).map((m) => m.id)).toEqual([invoice]);
		expect(
			(await searchMessages(db, words('von:anna betreff:relaunch'))).map((m) => m.id)
		).toContain(offer);
		expect(await searchMessages(db, words('betreff:freitag'))).toEqual([]);
		expect(await searchMessages(db, words('"'))).toEqual([]);
	});

	it('narrows by account, sender, time, attachments and unread, also without words', async () => {
		const a = await account('a@beispiel.de');
		const b = await account('b@beispiel.de');
		const inboxA = await mailbox(a, 'INBOX', 'inbox');
		const inboxB = await mailbox(b, 'INBOX', 'inbox');
		// uid = day in October 2026; message() sends them all from anna@firma.de.
		await message(inboxA, 2, 'Planung Anfang', true);
		const late = await message(inboxA, 20, 'Planung Ende');
		const other = await message(inboxB, 10, 'Planung Mitte', true);
		await db
			.update(messages)
			.set({ fromName: 'Jonas Weber', fromAddress: 'jonas@weber.de' })
			.where(eq(messages.id, other));
		await db.update(messages).set({ hasAttachments: true }).where(eq(messages.id, late));
		const subjects = async (query: SearchQuery) =>
			(await searchMessages(db, query)).map((m) => m.subject);

		expect(await subjects(words('planung'))).toEqual([
			'Planung Ende',
			'Planung Mitte',
			'Planung Anfang'
		]);
		// Several accounts at once, or one.
		expect(await subjects(words('planung', { accounts: [a, b] }))).toHaveLength(3);
		expect(await subjects(words('planung', { accounts: [b] }))).toEqual(['Planung Mitte']);
		// Sender by name or address, as word beginnings.
		expect(await subjects(words('', { from: 'jon' }))).toEqual(['Planung Mitte']);
		expect(await subjects(words('', { from: 'weber.de' }))).toEqual(['Planung Mitte']);
		// From the 5th to before the 15th.
		expect(
			await subjects(words('', { since: Date.UTC(2026, 9, 5), until: Date.UTC(2026, 9, 15) }))
		).toEqual(['Planung Mitte']);
		expect(await subjects(words('', { since: Date.UTC(2026, 9, 15) }))).toEqual(['Planung Ende']);
		expect(await subjects(words('', { attachments: true }))).toEqual(['Planung Ende']);
		expect(await subjects(words('', { unread: true, accounts: [a] }))).toEqual(['Planung Ende']);
		// Newsletters only, or none; not yet looked at counts as none.
		await db.update(messages).set({ newsletter: true }).where(eq(messages.id, other));
		await db.update(messages).set({ newsletter: null }).where(eq(messages.id, late));
		expect(await subjects(words('', { newsletters: 'only' }))).toEqual(['Planung Mitte']);
		expect(await subjects(words('planung', { newsletters: 'hide' }))).toEqual([
			'Planung Ende',
			'Planung Anfang'
		]);
		// Nothing to narrow by: nothing listed.
		expect(await searchMessages(db, words('  '))).toEqual([]);
	});
});

describe('suggestAddresses', () => {
	it('suggests senders and recipients, best match and most frequent first', async () => {
		const a = await account('du@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		const sent = await mailbox(a, 'Sent', 'sent');
		const from = async (uid: number, name: string, address: string) => {
			const id = await message(inbox, uid, 'Hallo');
			await db
				.update(messages)
				.set({ fromName: name, fromAddress: address })
				.where(eq(messages.id, id));
		};
		await from(1, 'Anna Becker', 'anna@firma.de');
		await from(2, 'Jonas Weber', 'jonas@weber.de');
		await from(3, 'Newsletter', 'no-reply@shop.de');
		await from(4, 'Du', 'du@beispiel.de');
		const mail = await message(sent, 5, 'Antwort');
		await db
			.update(messages)
			.set({
				to: [{ name: 'Lea Hoffmann', address: 'lea@beispiel.org' }],
				cc: [{ address: 'anna@firma.de' }]
			})
			.where(eq(messages.id, mail));

		const suggest = (text: string) => suggestAddresses(db, text, ['du@beispiel.de']);
		// Matches at the start of a name or address come first ("an" is in "Hoffmann" too).
		expect(await suggest('an')).toEqual([
			{ name: 'Anna Becker', address: 'anna@firma.de' },
			{ name: 'Lea Hoffmann', address: 'lea@beispiel.org' }
		]);
		// Name parts, addresses and recipients of sent mail count.
		expect(await suggest('hoff')).toEqual([{ name: 'Lea Hoffmann', address: 'lea@beispiel.org' }]);
		expect(await suggest('weber.de')).toEqual([{ name: 'Jonas Weber', address: 'jonas@weber.de' }]);
		// Written to counts more than written by.
		expect((await suggest('e')).map((p) => p.address).slice(0, 2)).toEqual([
			'anna@firma.de',
			'lea@beispiel.org'
		]);
		// Not the own address, not machines, not wildcards.
		expect(await suggest('du')).toEqual([]);
		expect(await suggest('shop')).toEqual([]);
		expect(await suggest('%')).toEqual([]);
		expect(await suggest('  ')).toEqual([]);
	});
});

describe('trusted senders', () => {
	it('marks bodies of trusted senders', async () => {
		const a = await account('a@beispiel.de');
		const inbox = await mailbox(a, 'INBOX', 'inbox');
		const id = await message(inbox, 1, 'Newsletter');
		await db.insert(messageBodies).values({ messageId: id, html: '<img src="https://x/y.png">' });

		expect(await findBody(db, id)).toMatchObject({ remoteContent: true, trusted: false });
		await trustSender(db, 'Anna@Firma.de');
		await trustSender(db, 'anna@firma.de');
		expect(await findBody(db, id)).toMatchObject({ trusted: true });
		expect(await listTrustedSenders(db)).toEqual(['anna@firma.de']);

		await untrustSender(db, 'Anna@Firma.de');
		expect(await listTrustedSenders(db)).toEqual([]);
		expect(await findBody(db, id)).toMatchObject({ trusted: false });
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

describe('threading', () => {
	it('reads the References header, folded or not', () => {
		const headers = Buffer.from(
			'References: <root@a.de>\r\n <reply1@b.de>\r\n\t<reply2@c.de>\r\n\r\n'
		);
		expect(parseReferences(headers)).toEqual(['<root@a.de>', '<reply1@b.de>', '<reply2@c.de>']);
		expect(parseReferences(Buffer.from('X-Other: <x@y>\r\n'))).toEqual([]);
		expect(parseReferences(undefined)).toEqual([]);
	});

	it('recognizes newsletters and where to unsubscribe', () => {
		const info = (headers: string) => newsletterInfo(Buffer.from(headers + '\r\n\r\n'));
		expect(
			info('List-Unsubscribe: <mailto:weg@shop.de?subject=stop>,\r\n <https://shop.de/stop?id=1>')
		).toEqual({
			newsletter: true,
			unsubscribe: 'https://shop.de/stop?id=1',
			unsubscribeOneClick: false
		});
		// One POST unsubscribes (RFC 8058).
		expect(
			info(
				'List-Unsubscribe: <https://shop.de/stop?id=1>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click'
			)
		).toMatchObject({ unsubscribe: 'https://shop.de/stop?id=1', unsubscribeOneClick: true });
		// No https: link, then the address; plain http: is not offered.
		expect(
			info(
				'List-Unsubscribe: <http://shop.de/stop>, <mailto:weg@shop.de>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click'
			)
		).toEqual({ newsletter: true, unsubscribe: 'mailto:weg@shop.de', unsubscribeOneClick: false });
		expect(info('List-Id: Vereinsnews <news.verein.de>')).toMatchObject({
			newsletter: true,
			unsubscribe: null
		});
		expect(info('Precedence: bulk')).toMatchObject({ newsletter: true, unsubscribe: null });
		expect(info('Precedence: first-class\r\nReferences: <a@b>')).toMatchObject({
			newsletter: false,
			unsubscribe: null
		});
		expect(newsletterInfo(undefined)).toEqual({
			newsletter: false,
			unsubscribe: null,
			unsubscribeOneClick: false
		});
	});

	it('keys a conversation by its first message', () => {
		expect(threadKey(['<root@a>', '<r1@b>'], '<r1@b>', '<r2@c>')).toBe('<root@a>');
		expect(threadKey([], '<root@a>', '<r1@b>')).toBe('<root@a>');
		expect(threadKey([], null, '<root@a>')).toBe('<root@a>');
		expect(threadKey([], null, null)).toBeNull();
	});
});
