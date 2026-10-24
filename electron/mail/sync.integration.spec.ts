import { eq } from 'drizzle-orm';
import { ImapFlow } from 'imapflow';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { greenMail, sendTestMail, withImap } from '../../scripts/greenmail.mjs';
import type { ServerSettings } from '../../src/lib/api';
import { imapOptions } from '../accounts/connection';
import { openDatabase, type Database } from '../db';
import { accounts, mailboxes, messages } from '../db/schema';
import { SyncManager } from './manager';
import { listMailboxes, listMessages, listThread } from './queries';
import { syncMailbox, syncMailboxes } from './sync';

const settings: ServerSettings = {
	imapHost: greenMail.host,
	imapPort: greenMail.imapPort,
	imapSecurity: 'none',
	smtpHost: greenMail.host,
	smtpPort: greenMail.smtpPort,
	smtpSecurity: 'none',
	username: greenMail.user.email
};

let db: Database;
let accountId: number;

beforeEach(async () => {
	// GreenMail lives for the whole run; every test starts with an empty inbox.
	await withImap(async (client) => {
		const lock = await client.getMailboxLock('INBOX');
		try {
			if (client.mailbox && client.mailbox.exists > 0) await client.messageDelete('1:*');
		} finally {
			lock.release();
		}
	});
	db = openDatabase(':memory:', path.resolve('drizzle'));
	[{ id: accountId }] = await db
		.insert(accounts)
		.values({
			name: 'Test',
			email: greenMail.user.email,
			color: '#2563eb',
			...settings,
			secret: Buffer.from('unused')
		})
		.returning();
});

async function syncInbox(client: ImapFlow) {
	const boxes = await syncMailboxes(db, accountId, client);
	const inbox = boxes.find((box) => box.role === 'inbox')!;
	return { inbox, changes: await syncMailbox(db, client, inbox) };
}

describe('syncMailbox against GreenMail', () => {
	let client: ImapFlow;

	beforeEach(async () => {
		client = new ImapFlow(imapOptions(settings, greenMail.user.password));
		await client.connect();
	});

	afterEach(async () => {
		await client.logout();
	});

	it('stores the folders with their roles and the messages with their headers', async () => {
		await sendTestMail({
			subject: 'Planung für nächste Woche',
			from: 'Anna Becker <anna@firma.de>'
		});
		await sendTestMail({ subject: 'Fotos vom Wochenende' });

		const { changes } = await syncInbox(client);
		expect(changes).toEqual({ added: 2, updated: 0, removed: 0 });
		expect(await listMailboxes(db)).toContainEqual(
			expect.objectContaining({ name: 'Posteingang', role: 'inbox', unread: 2 })
		);
		const list = await listMessages(db, { inboxes: true });
		expect(list.map((m) => m.subject).sort()).toEqual([
			'Fotos vom Wochenende',
			'Planung für nächste Woche'
		]);
		expect(list.find((m) => m.subject.startsWith('Planung'))).toMatchObject({
			accountId,
			fromName: 'Anna Becker',
			fromAddress: 'anna@firma.de',
			to: [{ address: greenMail.user.email }],
			seen: false
		});
	});

	it('fetches only what is new on the next round', async () => {
		await sendTestMail({ subject: 'Eins' });
		await syncInbox(client);
		await sendTestMail({ subject: 'Zwei' });

		const { changes } = await syncInbox(client);
		expect(changes.added).toBe(1);
		expect(await db.select().from(messages)).toHaveLength(2);
	});

	it('picks up flags changed and messages deleted on the server', async () => {
		await sendTestMail({ subject: 'Gelesen' });
		await sendTestMail({ subject: 'Gelöscht' });
		await syncInbox(client);

		await withImap(async (other) => {
			const lock = await other.getMailboxLock('INBOX');
			try {
				const [read] = (await other.search({ subject: 'Gelesen' }, { uid: true })) || [];
				const [gone] = (await other.search({ subject: 'Gelöscht' }, { uid: true })) || [];
				await other.messageFlagsAdd(String(read), ['\\Seen', '\\Flagged'], { uid: true });
				await other.messageDelete(String(gone), { uid: true });
			} finally {
				lock.release();
			}
		});

		const { changes } = await syncInbox(client);
		expect(changes).toEqual({ added: 0, updated: 1, removed: 1 });
		const [row] = await db.select().from(messages);
		expect(row).toMatchObject({ subject: 'Gelesen', seen: true, flagged: true });
	});

	it('groups replies into one conversation', async () => {
		await sendTestMail({ subject: 'Planung', messageId: '<root@beispiel.test>' });
		await sendTestMail({
			subject: 'Re: Planung',
			messageId: '<reply@beispiel.test>',
			inReplyTo: '<root@beispiel.test>',
			references: ['<root@beispiel.test>']
		});
		await sendTestMail({ subject: 'Etwas anderes' });
		await syncInbox(client);

		const list = await listMessages(db, { inboxes: true });
		expect(list.map((m) => [m.subject, m.threadSize]).sort()).toEqual([
			['Etwas anderes', 1],
			['Re: Planung', 2]
		]);
		const reply = list.find((m) => m.subject === 'Re: Planung')!;
		expect((await listThread(db, reply.id)).map((m) => m.subject)).toEqual([
			'Planung',
			'Re: Planung'
		]);
	});

	it('starts over when the server changes UIDVALIDITY', async () => {
		await sendTestMail({ subject: 'Alt' });
		const { inbox } = await syncInbox(client);
		await db.update(mailboxes).set({ uidValidity: 1 }).where(eq(mailboxes.id, inbox.id));
		await db.update(messages).set({ subject: 'veraltet' });

		await syncInbox(client);
		expect((await db.select().from(messages)).map((m) => m.subject)).toEqual(['Alt']);
	});
});

describe('SyncManager against GreenMail', () => {
	let manager: SyncManager;

	afterEach(async () => {
		await manager.stopAll();
	});

	it('syncs on start, shows new mail right away (IDLE) and marks messages read', async () => {
		await sendTestMail({ subject: 'Vor dem Start' });
		const onChanged = vi.fn();
		const onStatus = vi.fn();
		manager = new SyncManager({
			db,
			credentials: async () => ({ settings, password: greenMail.user.password }),
			onChanged,
			onStatus
		});

		await manager.start(accountId);
		expect(onStatus).toHaveBeenCalledWith({ accountId, state: 'ready' });
		expect((await listMessages(db, { inboxes: true })).map((m) => m.subject)).toEqual([
			'Vor dem Start'
		]);

		onChanged.mockClear();
		await sendTestMail({ subject: 'Ganz neu' });
		await vi.waitFor(
			async () => {
				expect(onChanged).toHaveBeenCalledWith(accountId);
				expect((await listMessages(db, { inboxes: true })).map((m) => m.subject)).toContain(
					'Ganz neu'
				);
			},
			{ timeout: 10_000, interval: 200 }
		);

		const [message] = await listMessages(db, { inboxes: true });
		await manager.setSeen(message.id, true);
		const seenOnServer = await withImap(async (other) => {
			const lock = await other.getMailboxLock('INBOX');
			try {
				return (await other.search({ seen: true }, { uid: true })) || [];
			} finally {
				lock.release();
			}
		});
		expect(seenOnServer).toHaveLength(1);
		expect((await listMessages(db, { inboxes: true }))[0].seen).toBe(true);
	});

	it('fetches contents ahead for the preview, and attachments on demand', async () => {
		await sendTestMail({
			subject: 'Angebot',
			text: 'Anbei das Angebot.\n\nBeste Grüße\nThomas',
			html: '<p>Anbei das <b>Angebot</b>.</p><img src="https://tracker.example/p.gif">',
			attachments: [{ filename: 'Angebot.pdf', content: Buffer.from('%PDF-1.4 Angebot') }]
		});
		manager = new SyncManager({
			db,
			credentials: async () => ({ settings, password: greenMail.user.password }),
			onChanged: () => {},
			onStatus: () => {}
		});
		await manager.start(accountId);

		const [message] = await listMessages(db, { inboxes: true });
		expect(message.snippet).toBe('Anbei das Angebot. Beste Grüße Thomas');
		expect(message.hasAttachments).toBe(true);

		const body = await manager.body(message.id);
		expect(body.html).toContain('<b>Angebot</b>');
		expect(body.remoteContent).toBe(true);
		expect(body.attachments).toEqual([
			expect.objectContaining({ filename: 'Angebot.pdf', size: 16 })
		]);

		const file = await manager.attachment(body.attachments[0].id);
		expect(file.content.toString()).toBe('%PDF-1.4 Angebot');
		expect(file.filename).toBe('Angebot.pdf');
	});

	it('reports when it cannot log in', async () => {
		const onStatus = vi.fn();
		manager = new SyncManager({
			db,
			credentials: async () => ({ settings, password: 'falsch' }),
			onChanged: () => {},
			onStatus
		});
		await manager.start(accountId);
		expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ accountId, state: 'error' }));
	});
});
