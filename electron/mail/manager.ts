// Keeps every account in sync: a full round when it starts and every few
// minutes, and IMAP IDLE on the inbox so new mail shows up right away. One
// connection per account; its jobs run one after another.
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { and, eq } from 'drizzle-orm';
import type {
	MailboxRole,
	OutgoingMessage,
	ReplySource,
	SavedDraft,
	SyncStatus
} from '../../src/lib/api';
import type { Credentials } from '../accounts/service';
import { imapOptions, smtpOptions } from '../accounts/connection';
import { mailboxes, messages } from '../db/schema';
import { buildMessage, savesSentCopy } from './outgoing';
import type { Database } from '../db';
import { fetchAttachment, fetchBody } from './body';
import {
	attachmentsOf,
	findAttachment,
	findBody,
	findMessage,
	newestUid,
	unseenAbove,
	withoutBody
} from './queries';
import { searchOnServer, setSeen, syncMailbox, syncMailboxes } from './sync';

export interface SyncManagerDeps {
	db: Database;
	credentials(accountId: number): Promise<Credentials | null>;
	/** The cache of this account changed. */
	onChanged(accountId: number): void;
	onStatus(status: SyncStatus): void;
	/** Unread messages arrived in the inbox since the last round (not on the first). */
	onNewMail?(accountId: number, messages: NewMail[]): void;
	/** Minutes between full rounds; IDLE covers the inbox in between. */
	intervalMinutes?: number;
	/** Newest inbox messages whose content is fetched ahead, for the preview line. */
	prefetch?: number;
}

export interface NewMail {
	id: number;
	fromName: string | null;
	fromAddress: string | null;
	subject: string;
}

interface Session {
	client: ImapFlow;
	queue: Promise<unknown>;
	timer?: ReturnType<typeof setInterval>;
	stopped: boolean;
}

export class SyncManager {
	private sessions = new Map<number, Session>();
	/** Failed attempts in a row per account, for the reconnect delay. */
	private failures = new Map<number, number>();
	/** Pending reconnects, cancelled by stop(). */
	private retries = new Map<number, ReturnType<typeof setTimeout>>();
	private starting = new Set<number>();

	constructor(private readonly deps: SyncManagerDeps) {}

	async start(accountId: number) {
		clearTimeout(this.retries.get(accountId));
		this.retries.delete(accountId);
		if (this.sessions.has(accountId) || this.starting.has(accountId)) return;
		this.starting.add(accountId);
		const credentials = await this.deps.credentials(accountId).finally(() => {
			this.starting.delete(accountId);
		});
		if (!credentials || this.sessions.has(accountId)) return;

		const client = new ImapFlow({
			...imapOptions(credentials.settings, credentials.password),
			// A long-lived connection: idle right after each round, renew IDLE
			// well before the socket times out.
			autoIdleDelay: 1000,
			maxIdleTime: 4 * 60_000,
			socketTimeout: 10 * 60_000
		});
		const session: Session = { client, queue: Promise.resolve(), stopped: false };
		this.sessions.set(accountId, session);

		client.on('error', () => {}); // Reported through the jobs and 'close'.
		client.on('close', () => this.reconnectLater(accountId, session));
		// New mail, deletions and flag changes in the selected (idling) inbox.
		for (const event of ['exists', 'expunge', 'flags']) {
			client.on(event, () => this.schedule(accountId, session, 'inbox'));
		}

		try {
			await client.connect();
		} catch (error) {
			this.fail(accountId, session, error);
			// A failed connect may not emit 'close'.
			this.reconnectLater(accountId, session);
			return;
		}
		await this.schedule(accountId, session, 'all');
		const minutes = this.deps.intervalMinutes ?? 5;
		session.timer = setInterval(() => this.schedule(accountId, session, 'all'), minutes * 60_000);
	}

	async stop(accountId: number) {
		clearTimeout(this.retries.get(accountId));
		this.retries.delete(accountId);
		this.failures.delete(accountId);
		const session = this.sessions.get(accountId);
		if (!session) return;
		session.stopped = true;
		this.sessions.delete(accountId);
		clearInterval(session.timer);
		await session.client.logout().catch(() => session.client.close());
	}

	async stopAll() {
		const ids = new Set([...this.sessions.keys(), ...this.retries.keys()]);
		await Promise.all([...ids].map((id) => this.stop(id)));
	}

	/** Runs a round now; resolves when it is done. */
	async syncNow(accountId: number) {
		const session = this.sessions.get(accountId);
		if (session) await this.schedule(accountId, session, 'all');
		else await this.start(accountId);
	}

	async setSeen(messageId: number, seen: boolean) {
		const found = await findMessage(this.deps.db, messageId);
		if (!found || found.message.seen === seen) return;
		const session = this.connected(found.mailbox.accountId);
		await this.run(session, () =>
			setSeen(this.deps.db, session.client, found.mailbox, found.message.uid, seen)
		);
		this.deps.onChanged(found.mailbox.accountId);
	}

	/** The content of a message, downloading it if needed. */
	async body(messageId: number) {
		const stored = await findBody(this.deps.db, messageId);
		if (stored) return stored;
		const found = await findMessage(this.deps.db, messageId);
		if (!found) throw new Error('Die Nachricht gibt es nicht mehr.');
		const session = this.connected(found.mailbox.accountId);
		await this.run(session, () =>
			fetchBody(this.deps.db, session.client, found.mailbox, found.message)
		);
		this.deps.onChanged(found.mailbox.accountId);
		return (await findBody(this.deps.db, messageId))!;
	}

	async attachment(attachmentId: number) {
		const found = await findAttachment(this.deps.db, attachmentId);
		if (!found) throw new Error('Den Anhang gibt es nicht mehr.');
		const session = this.connected(found.mailbox.accountId);
		const content = await this.run(session, () =>
			fetchAttachment(
				session.client,
				found.mailbox,
				found.message.uid,
				Number(found.attachment.part)
			)
		);
		return {
			content,
			filename: found.attachment.filename,
			contentType: found.attachment.contentType
		};
	}

	/**
	 * Searches every connected account's folders (not trash and spam) on the
	 * server and stores older hits the cache did not have; returns how many.
	 */
	async searchServer(text: string) {
		let added = 0;
		for (const [accountId, session] of this.sessions) {
			const boxes = await this.deps.db
				.select()
				.from(mailboxes)
				.where(eq(mailboxes.accountId, accountId));
			const searchable = boxes.filter((box) => box.role !== 'trash' && box.role !== 'junk');
			const found = await this.run(session, async () => {
				let count = 0;
				for (const box of searchable) {
					count += await searchOnServer(this.deps.db, session.client, box, text);
				}
				return count;
			});
			if (found > 0) this.deps.onChanged(accountId);
			added += found;
		}
		return added;
	}

	/** What a reply or forward needs: headers, recipients and the text to quote. */
	async replySource(messageId: number): Promise<ReplySource> {
		const found = await findMessage(this.deps.db, messageId);
		if (!found) throw new Error('Die Nachricht gibt es nicht mehr.');
		const [body, account] = await Promise.all([
			this.body(messageId),
			this.deps.credentials(found.mailbox.accountId)
		]);
		const { message } = found;
		return {
			messageId: message.messageId,
			references: message.references ?? [],
			from: message.fromAddress
				? { name: message.fromName ?? undefined, address: message.fromAddress }
				: null,
			to: message.to,
			cc: message.cc,
			subject: message.subject,
			date: message.date.getTime(),
			text: body.text ?? '',
			html: body.html,
			attachments: body.attachments,
			accountId: found.mailbox.accountId,
			accountEmail: account?.email ?? '',
			uid: message.uid,
			isDraft: found.mailbox.role === 'drafts' || message.draft
		};
	}

	/**
	 * Sends over SMTP, then stores a copy in "Gesendet" (unless the provider
	 * does that itself), marks the answered message and removes the draft.
	 */
	async send(message: OutgoingMessage) {
		const account = await this.account(message.accountId);
		const built = await buildMessage({ name: account.name, address: account.email }, message, {
			stored: await this.storedFiles(message)
		});
		const transport = nodemailer.createTransport(smtpOptions(account.settings, account.password));
		try {
			await transport.sendMail({ envelope: built.envelope, raw: built.raw });
		} finally {
			transport.close();
		}

		const session = this.connected(message.accountId);
		await this.run(session, async () => {
			if (!savesSentCopy(account.settings)) {
				const sent = await this.folder(message.accountId, session, 'sent', 'Sent');
				await session.client.append(sent.path, built.raw, ['\\Seen']);
			}
			if (message.replyTo) {
				const original = await findMessage(this.deps.db, message.replyTo);
				if (original) {
					const lock = await session.client.getMailboxLock(original.mailbox.path);
					try {
						await session.client.messageFlagsAdd(String(original.message.uid), ['\\Answered'], {
							uid: true
						});
					} finally {
						lock.release();
					}
					await this.deps.db
						.update(messages)
						.set({ answered: true })
						.where(eq(messages.id, original.message.id));
				}
			}
			if (message.draftUid) await this.removeDraft(message.accountId, session, message.draftUid);
		});
		await this.schedule(message.accountId, session, 'all');
	}

	/** Stores the message in "Entwürfe", replacing the previous version. */
	async saveDraft(message: OutgoingMessage): Promise<SavedDraft> {
		const account = await this.account(message.accountId);
		const built = await buildMessage({ name: account.name, address: account.email }, message, {
			draft: true,
			stored: await this.storedFiles(message)
		});
		const session = this.connected(message.accountId);
		const result = await this.run(session, async () => {
			const drafts = await this.folder(message.accountId, session, 'drafts', 'Drafts');
			const saved = await session.client.append(drafts.path, built.raw, ['\\Draft', '\\Seen']);
			if (message.draftUid) await this.removeDraft(message.accountId, session, message.draftUid);
			await syncMailbox(this.deps.db, session.client, drafts);
			const uid = saved ? (saved.uid ?? null) : null;
			if (!uid) return { uid, attachments: [] };
			// Attachments are stored with the content; the draft's ids replace the old ones.
			const [stored] = await this.deps.db
				.select()
				.from(messages)
				.where(and(eq(messages.mailboxId, drafts.id), eq(messages.uid, uid)));
			if (stored) await fetchBody(this.deps.db, session.client, drafts, stored);
			return { uid, attachments: await attachmentsOf(this.deps.db, drafts.id, uid) };
		});
		this.deps.onChanged(message.accountId);
		return result;
	}

	async deleteDraft(accountId: number, uid: number) {
		const session = this.connected(accountId);
		await this.run(session, () => this.removeDraft(accountId, session, uid));
		this.deps.onChanged(accountId);
	}

	/** Moves messages to the account's archive or trash folder. */
	async move(messageIds: number[], role: 'archive' | 'trash') {
		const found = (await Promise.all(messageIds.map((id) => findMessage(this.deps.db, id)))).filter(
			(row) => row !== null
		);
		const byAccount = Map.groupBy(found, (row) => row.mailbox.accountId);
		for (const [accountId, rows] of byAccount) {
			const session = this.connected(accountId);
			await this.run(session, async () => {
				const target = await this.folder(
					accountId,
					session,
					role,
					role === 'trash' ? 'Trash' : 'Archive'
				);
				for (const [, inBox] of Map.groupBy(
					rows.filter((row) => row.mailbox.id !== target.id),
					(row) => row.mailbox.id
				)) {
					const lock = await session.client.getMailboxLock(inBox[0].mailbox.path);
					try {
						await session.client.messageMove(
							inBox.map((row) => row.message.uid).join(','),
							target.path,
							{ uid: true }
						);
					} finally {
						lock.release();
					}
					for (const row of inBox) {
						await this.deps.db.delete(messages).where(eq(messages.id, row.message.id));
					}
				}
				await syncMailbox(this.deps.db, session.client, target);
			});
			this.deps.onChanged(accountId);
		}
	}

	/** Downloads the attachments to forward; they must belong to this account. */
	private async storedFiles(message: OutgoingMessage) {
		const files = [];
		for (const id of message.forwardAttachments ?? []) {
			const found = await findAttachment(this.deps.db, id);
			if (found?.mailbox.accountId !== message.accountId) {
				throw new Error('Ein Anhang gehört nicht zu diesem Konto.');
			}
			const { content, filename, contentType } = await this.attachment(id);
			files.push({ content, filename, contentType });
		}
		return files;
	}

	private async account(accountId: number) {
		const account = await this.deps.credentials(accountId);
		if (!account) throw new Error('Das Konto gibt es nicht mehr.');
		return account;
	}

	/** The account's folder with that role; created if the server has none. */
	private async folder(accountId: number, session: Session, role: MailboxRole, name: string) {
		const find = () =>
			this.deps.db
				.select()
				.from(mailboxes)
				.where(and(eq(mailboxes.accountId, accountId), eq(mailboxes.role, role)));
		let [box] = await find();
		if (!box) {
			await session.client.mailboxCreate(name).catch(() => {});
			await syncMailboxes(this.deps.db, accountId, session.client);
			[box] = await find();
		}
		if (!box) throw new Error(`Der Ordner „${name}“ ließ sich nicht anlegen.`);
		return box;
	}

	private async removeDraft(accountId: number, session: Session, uid: number) {
		const drafts = await this.folder(accountId, session, 'drafts', 'Drafts');
		const lock = await session.client.getMailboxLock(drafts.path);
		try {
			await session.client.messageDelete(String(uid), { uid: true });
		} finally {
			lock.release();
		}
		await this.deps.db
			.delete(messages)
			.where(and(eq(messages.mailboxId, drafts.id), eq(messages.uid, uid)));
	}

	private connected(accountId: number) {
		const session = this.sessions.get(accountId);
		if (!session) throw new Error('Das Konto ist gerade nicht verbunden.');
		return session;
	}

	private schedule(accountId: number, session: Session, scope: 'all' | 'inbox') {
		return this.run(session, async () => {
			if (scope === 'all') this.deps.onStatus({ accountId, state: 'syncing' });
			const boxes = await syncMailboxes(this.deps.db, accountId, session.client);
			// The inbox goes last, so it stays selected and IDLE watches it.
			const inbox = boxes.find((box) => box.role === 'inbox');
			const others = scope === 'all' ? boxes.filter((box) => box !== inbox) : [];
			// What was there before; a first sync announces nothing.
			const known =
				inbox?.lastSyncedAt != null ? await newestUid(this.deps.db, inbox.id) : undefined;
			let changed = false;
			for (const box of [...others, ...(inbox ? [inbox] : [])]) {
				const result = await syncMailbox(this.deps.db, session.client, box);
				changed ||= result.added + result.updated + result.removed > 0;
			}
			if (inbox && known !== undefined) {
				const arrived = await unseenAbove(this.deps.db, inbox.id, known);
				if (arrived.length > 0) this.deps.onNewMail?.(accountId, arrived);
			}
			// A round can also bring new folders.
			if (changed || scope === 'all') this.deps.onChanged(accountId);
			if (inbox && (await this.prefetch(session, inbox))) this.deps.onChanged(accountId);
			if (scope === 'all') {
				this.failures.delete(accountId);
				this.deps.onStatus({ accountId, state: 'ready' });
			}
		}).catch((error) => this.fail(accountId, session, error));
	}

	/** Fetches the content of the newest inbox messages; true if any. */
	private async prefetch(session: Session, inbox: Parameters<typeof fetchBody>[2]) {
		const pending = await withoutBody(this.deps.db, inbox.id, this.deps.prefetch ?? 30);
		for (const { id } of pending) {
			const found = await findMessage(this.deps.db, id);
			// One broken message must not stop the others.
			if (found)
				await fetchBody(this.deps.db, session.client, inbox, found.message).catch(() => {});
		}
		return pending.length > 0;
	}

	/** Queues a job on the account's connection. */
	private run<T>(session: Session, job: () => Promise<T>): Promise<T> {
		const next = session.queue.then(job, job);
		session.queue = next.catch(() => {});
		return next;
	}

	private fail(accountId: number, session: Session, error: unknown) {
		if (session.stopped) return;
		this.failures.set(accountId, (this.failures.get(accountId) ?? 0) + 1);
		const message = error instanceof Error ? error.message : String(error);
		this.deps.onStatus({ accountId, state: 'error', error: message });
		session.client.close();
	}

	/** Reconnects after 5 s, 30 s, 2 min, then every 5 min. */
	private reconnectLater(accountId: number, session: Session) {
		if (session.stopped || this.sessions.get(accountId) !== session) return;
		this.sessions.delete(accountId);
		clearInterval(session.timer);
		const delays = [5, 30, 120, 300];
		const failures = this.failures.get(accountId) ?? 1;
		const delay = delays[Math.min(failures - 1, delays.length - 1)] * 1000;
		this.retries.set(
			accountId,
			setTimeout(() => this.start(accountId), delay)
		);
	}
}
