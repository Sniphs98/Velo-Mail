import { eq, isNull } from 'drizzle-orm';
import { ImapFlow } from 'imapflow';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { samplePdf } from '../testing/sample-pdf';
import { noFilters } from '../../src/lib/search';
import { greenMail, sendTestMail, withImap } from '../../scripts/greenmail.mjs';
import type { ServerSettings } from '../../src/lib/api';
import { imapOptions } from '../accounts/connection';
import { openDatabase, type Database } from '../db';
import { accounts, mailboxes, messages } from '../db/schema';
import { SyncManager } from './manager';
import { listMailboxes, listMessages, listThread, searchMessages } from './queries';
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

const account = { name: 'Test', email: greenMail.user.email, settings };

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

	it('recognizes newsletters by their headers, also in messages cached before', async () => {
		await sendTestMail({
			subject: 'Angebote der Woche',
			headers: {
				'List-Unsubscribe': '<mailto:weg@shop.test?subject=abmelden>, <https://shop.test/abmelden>'
			}
		});
		await sendTestMail({ subject: 'Vereinsnews', headers: { 'List-Id': '<news.verein.test>' } });
		await sendTestMail({ subject: 'Hallo' });

		await syncInbox(client);
		const flagged = async () =>
			Object.fromEntries(
				(await listMessages(db, { inboxes: true })).map((m) => [
					m.subject,
					[m.newsletter, m.unsubscribe]
				])
			);
		expect(await flagged()).toEqual({
			'Angebote der Woche': [true, 'https://shop.test/abmelden'],
			Vereinsnews: [true, null],
			Hallo: [false, null]
		});

		// Cached before newsletters were recognized: the next round looks again.
		await db.update(messages).set({ newsletter: null, unsubscribe: null });
		const { changes } = await syncInbox(client);
		expect(changes.updated).toBe(2);
		expect(await flagged()).toEqual({
			'Angebote der Woche': [true, 'https://shop.test/abmelden'],
			Vereinsnews: [true, null],
			Hallo: [false, null]
		});
		expect(await db.select().from(messages).where(isNull(messages.newsletter))).toEqual([]);
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
		const onNewMail = vi.fn();
		manager = new SyncManager({
			db,
			credentials: async () => ({ ...account, password: greenMail.user.password }),
			onChanged,
			onStatus,
			onNewMail
		});

		await manager.start(accountId);
		expect(onStatus).toHaveBeenCalledWith({ accountId, state: 'ready' });
		expect((await listMessages(db, { inboxes: true })).map((m) => m.subject)).toEqual([
			'Vor dem Start'
		]);
		// What was there before the first sync is not news.
		expect(onNewMail).not.toHaveBeenCalled();

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
		expect(onNewMail).toHaveBeenCalledExactlyOnceWith(accountId, [
			expect.objectContaining({ subject: 'Ganz neu', fromAddress: 'jonas@beispiel.test' })
		]);

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
			credentials: async () => ({ ...account, password: greenMail.user.password }),
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
			credentials: async () => ({ ...account, password: 'falsch' }),
			onChanged: () => {},
			onStatus
		});
		await manager.start(accountId);
		expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ accountId, state: 'error' }));
	});
});

describe('writing against GreenMail', () => {
	let manager: SyncManager;
	const outgoing = (over: Partial<Parameters<SyncManager['send']>[0]> = {}) => ({
		accountId,
		to: greenMail.user.email,
		cc: '',
		bcc: '',
		subject: 'Hallo von Velo',
		text: 'Testnachricht',
		attachments: [],
		...over
	});

	async function count(path: string, query: object = { all: true }) {
		return withImap(async (client) => {
			const lock = await client.getMailboxLock(path);
			try {
				return ((await client.search(query, { uid: true })) || []).length;
			} finally {
				lock.release();
			}
		});
	}

	/** The server path of the account's folder with that role. */
	async function pathOf(role: string) {
		const boxes = await db.select().from(mailboxes);
		return boxes.find((box) => box.role === role)?.path;
	}

	beforeEach(async () => {
		manager = new SyncManager({
			db,
			credentials: async () => ({ ...account, password: greenMail.user.password }),
			onChanged: () => {},
			onStatus: () => {}
		});
		await manager.start(accountId);
	});

	afterEach(async () => {
		await manager.stopAll();
	});

	it('sends, keeps a copy in the sent folder and marks the answered message', async () => {
		await sendTestMail({ subject: 'Frage', messageId: '<frage@beispiel.test>' });
		await manager.syncNow(accountId);
		const [question] = await listMessages(db, { inboxes: true });
		const sentBefore = await withImap(async (client) =>
			(await client.list()).some((box) => box.specialUse === '\\Sent')
				? count((await client.list()).find((box) => box.specialUse === '\\Sent')!.path)
				: 0
		);

		await manager.send(
			outgoing({
				subject: 'Re: Frage',
				replyTo: question.id,
				inReplyTo: '<frage@beispiel.test>',
				references: ['<frage@beispiel.test>']
			})
		);

		expect(await count('INBOX', { subject: 'Re: Frage' })).toBe(1);
		expect(await count('INBOX', { answered: true, subject: 'Frage' })).toBe(1);
		const sentPath = (await pathOf('sent'))!;
		expect(await count(sentPath)).toBe(sentBefore + 1);
		// The reply joins the question's conversation, sent copy included.
		expect((await listThread(db, question.id)).map((m) => m.subject)).toContain('Re: Frage');
	});

	it('saves a draft, replaces it, and deletes it', async () => {
		const drafts = async () => (await pathOf('drafts')) ?? 'Drafts';
		const first = await manager.saveDraft(outgoing({ subject: 'Entwurf', to: '' }));
		expect(first).toEqual({ uid: expect.any(Number), attachments: [] });
		const before = await count(await drafts());

		const second = await manager.saveDraft(
			outgoing({ subject: 'Entwurf 2', draftUid: first.uid! })
		);
		expect(await count(await drafts())).toBe(before);
		expect(await count(await drafts(), { subject: 'Entwurf 2', draft: true })).toBe(1);

		await manager.deleteDraft(accountId, second.uid!);
		expect(await count(await drafts())).toBe(before - 1);
	});

	it('forwards attachments, in drafts and when sending, with a formatted version', async () => {
		await sendTestMail({
			subject: 'Mit Plan',
			attachments: [{ filename: 'plan.txt', content: 'Der Plan' }]
		});
		await manager.syncNow(accountId);
		const [original] = await listMessages(db, { inboxes: true });
		const source = await manager.replySource(original.id);
		expect(source.attachments).toEqual([expect.objectContaining({ filename: 'plan.txt' })]);

		const draft = await manager.saveDraft(
			outgoing({
				subject: 'Fwd: Mit Plan',
				to: '',
				forwardAttachments: source.attachments.map((a) => a.id)
			})
		);
		expect(draft.attachments).toEqual([expect.objectContaining({ filename: 'plan.txt' })]);
		// Saving again takes the attachments from the draft itself.
		const again = await manager.saveDraft(
			outgoing({
				subject: 'Fwd: Mit Plan',
				to: '',
				draftUid: draft.uid!,
				forwardAttachments: draft.attachments.map((a) => a.id)
			})
		);
		expect(again.attachments).toHaveLength(1);

		await manager.send(
			outgoing({
				subject: 'Fwd: Mit Plan',
				text: 'Schau mal',
				html: '<p>Schau <strong>mal</strong></p>',
				draftUid: again.uid!,
				forwardAttachments: again.attachments.map((a) => a.id)
			})
		);
		await manager.syncNow(accountId);
		const forwarded = (await listMessages(db, { inboxes: true })).find(
			(m) => m.subject === 'Fwd: Mit Plan'
		)!;
		expect(forwarded.hasAttachments).toBe(true);
		const body = await manager.body(forwarded.id);
		expect(body.html).toContain('<strong>mal</strong>');
		expect(body.text).toContain('Schau mal');
		expect(body.attachments.map((a) => a.filename)).toEqual(['plan.txt']);
		expect((await manager.attachment(body.attachments[0].id)).content.toString()).toBe('Der Plan');
	});

	it('finds a message by the text of its PDF attachment', async () => {
		await sendTestMail({
			subject: 'Post vom Amt',
			attachments: [{ filename: 'bescheid.pdf', content: samplePdf('Steuernummer 4711') }]
		});
		await manager.syncNow(accountId);
		const [message] = await listMessages(db, { inboxes: true });
		await manager.body(message.id);
		expect(
			(await searchMessages(db, { ...noFilters, text: 'steuernummer' })).map((m) => m.subject)
		).toEqual(['Post vom Amt']);
		expect(
			(await searchMessages(db, { ...noFilters, text: 'bescheid' })).map((m) => m.subject)
		).toEqual(['Post vom Amt']);
	});

	it('refuses to forward attachments of another account', async () => {
		await expect(
			manager.send(outgoing({ accountId: accountId + 1, forwardAttachments: [1] }))
		).rejects.toThrow();
	});

	it('finds older messages on the server that the cache does not have', async () => {
		await sendTestMail({ subject: 'Uralte Rechnung', text: 'Rechnungsnummer 4711' });
		await sendTestMail({ subject: 'Neu' });
		await manager.syncNow(accountId);
		// As if the old one were outside the first sync's window.
		await db.delete(messages).where(eq(messages.subject, 'Uralte Rechnung'));
		expect(await searchMessages(db, { ...noFilters, text: '4711' })).toEqual([]);

		expect(await manager.searchServer({ ...noFilters, text: 'Rechnung' })).toBe(1);
		expect(
			(await searchMessages(db, { ...noFilters, text: 'uralte' })).map((m) => m.subject)
		).toEqual(['Uralte Rechnung']);
		expect(await manager.searchServer({ ...noFilters, text: 'Rechnung' })).toBe(0);
	});

	it('searches the server by sender and only in the chosen accounts', async () => {
		await sendTestMail({ subject: 'Von Lea', from: 'Lea Kraus <lea@kraus.test>' });
		await sendTestMail({ subject: 'Von Jonas' });
		await sendTestMail({ subject: 'Neuer' });
		await manager.syncNow(accountId);
		// As if Lea's were older than the cache reaches.
		await db.delete(messages).where(eq(messages.subject, 'Von Lea'));
		// GreenMail matches FROM only on the whole address; real servers also on parts.
		const fromLea = { ...noFilters, text: '', from: 'lea@kraus.test' };

		expect(await manager.searchServer({ ...fromLea, accounts: [accountId + 1] })).toBe(0);
		expect(await manager.searchServer(fromLea)).toBe(1);
		expect((await searchMessages(db, fromLea)).map((m) => m.subject)).toEqual(['Von Lea']);
	});

	it('archives and deletes messages', async () => {
		await sendTestMail({ subject: 'Ins Archiv' });
		await sendTestMail({ subject: 'In den Papierkorb' });
		await manager.syncNow(accountId);
		const list = await listMessages(db, { inboxes: true });
		const archive = list.find((m) => m.subject === 'Ins Archiv')!;
		const trash = list.find((m) => m.subject === 'In den Papierkorb')!;

		await manager.move([archive.id], 'archive');
		await manager.move([trash.id], 'trash');

		expect(await count('INBOX')).toBe(0);
		expect(await count((await pathOf('archive'))!, { subject: 'Ins Archiv' })).toBe(1);
		expect(await count((await pathOf('trash'))!, { subject: 'In den Papierkorb' })).toBe(1);
		expect(await listMessages(db, { inboxes: true })).toEqual([]);
	});
});
