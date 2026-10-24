import { eq, sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './index';
import { accounts, mailboxes, messageBodies, messages } from './schema';

const migrationsFolder = path.resolve('drizzle');

const account = {
	name: 'Persönlich',
	email: 'du@beispiel.de',
	color: '#2563eb',
	imapHost: 'imap.beispiel.de',
	imapPort: 993,
	imapSecurity: 'tls',
	smtpHost: 'smtp.beispiel.de',
	smtpPort: 465,
	smtpSecurity: 'tls',
	username: 'du@beispiel.de'
} as const;

async function seed(db: Database) {
	const [{ id: accountId }] = await db.insert(accounts).values(account).returning();
	const [{ id: mailboxId }] = await db
		.insert(mailboxes)
		.values({ accountId, path: 'INBOX', name: 'Posteingang', role: 'inbox' })
		.returning();
	const [message] = await db
		.insert(messages)
		.values({
			mailboxId,
			uid: 1,
			subject: 'Planung für nächste Woche',
			fromName: 'Anna Becker',
			fromAddress: 'anna@firma.de',
			to: [{ name: 'Du', address: 'du@beispiel.de' }],
			date: new Date('2026-10-24T09:42:00Z'),
			flagged: true
		})
		.returning();
	return { accountId, mailboxId, message };
}

async function search(db: Database, query: string) {
	const rows = await db.all<{ rowid: number }>(
		sql`select rowid from messages_fts where messages_fts match ${query}`
	);
	return rows.map((row) => row.rowid);
}

describe('openDatabase', () => {
	let db: Database;

	beforeEach(() => {
		db = openDatabase(':memory:', migrationsFolder);
	});

	it('creates the schema', async () => {
		const tables = await db.all<{ name: string }>(
			sql`select name from sqlite_master where type = 'table' order by name`
		);
		// Leaves out SQLite's, Drizzle's and FTS5's internal tables.
		const own = tables.filter((t) => !/^(sqlite_|__|messages_fts_)/.test(t.name));
		expect(own.map((t) => t.name)).toEqual([
			'accounts',
			'attachments',
			'mailboxes',
			'message_bodies',
			'messages',
			'messages_fts',
			'sender_avatars',
			'settings',
			'trusted_senders'
		]);
	});

	it('stores and reads back messages with their types', async () => {
		const { message } = await seed(db);
		const [row] = await db.select().from(messages).where(eq(messages.id, message.id));
		expect(row.to).toEqual([{ name: 'Du', address: 'du@beispiel.de' }]);
		expect(row.cc).toEqual([]);
		expect(row.date).toEqual(new Date('2026-10-24T09:42:00Z'));
		expect(row.flagged).toBe(true);
		expect(row.seen).toBe(false);
	});

	it('keeps one row per UID and mailbox', async () => {
		const { mailboxId } = await seed(db);
		await expect(
			db.insert(messages).values({ mailboxId, uid: 1, date: new Date() })
		).rejects.toMatchObject({ cause: { message: expect.stringMatching(/UNIQUE/) } });
	});

	it('finds messages by subject, sender and body', async () => {
		const { message } = await seed(db);
		await db
			.insert(messageBodies)
			.values({ messageId: message.id, text: 'Schöne Grüße und bis Montag' });

		expect(await search(db, 'planung')).toEqual([message.id]);
		expect(await search(db, 'sender:anna')).toEqual([message.id]);
		expect(await search(db, 'montag')).toEqual([message.id]);
		// Accents don't matter.
		expect(await search(db, 'schone')).toEqual([message.id]);
		expect(await search(db, 'urlaub')).toEqual([]);
	});

	it('updates the search index when a message changes', async () => {
		const { message } = await seed(db);
		await db.update(messages).set({ subject: 'Urlaubsplanung' }).where(eq(messages.id, message.id));
		expect(await search(db, 'urlaubsplanung')).toEqual([message.id]);
		expect(await search(db, 'woche')).toEqual([]);
	});

	it('removes everything of an account when it is deleted', async () => {
		const { accountId, message } = await seed(db);
		await db.insert(messageBodies).values({ messageId: message.id, text: 'Hallo' });
		await db.delete(accounts).where(eq(accounts.id, accountId));

		expect(await db.select().from(mailboxes)).toEqual([]);
		expect(await db.select().from(messages)).toEqual([]);
		expect(await db.select().from(messageBodies)).toEqual([]);
		expect(await search(db, 'hallo OR planung')).toEqual([]);
	});
});

describe('openDatabase on disk', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), 'velo-db-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('keeps data and migrates only once across restarts', async () => {
		const file = path.join(dir, 'velo-mail.db');
		await seed(openDatabase(file, migrationsFolder));

		const reopened = openDatabase(file, migrationsFolder);
		expect(await reopened.select().from(accounts)).toHaveLength(1);
	});
});
