// Keeps every account in sync: a full round when it starts and every few
// minutes, and IMAP IDLE on the inbox so new mail shows up right away. One
// connection per account; its jobs run one after another.
import { ImapFlow } from 'imapflow';
import type { ServerSettings, SyncStatus } from '../../src/lib/api';
import { imapOptions } from '../accounts/connection';
import type { Database } from '../db';
import { findMessage } from './queries';
import { setSeen, syncMailbox, syncMailboxes } from './sync';

export interface SyncManagerDeps {
	db: Database;
	credentials(accountId: number): Promise<{ settings: ServerSettings; password: string } | null>;
	/** The cache of this account changed. */
	onChanged(accountId: number): void;
	onStatus(status: SyncStatus): void;
	/** Minutes between full rounds; IDLE covers the inbox in between. */
	intervalMinutes?: number;
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
		const session = this.sessions.get(found.mailbox.accountId);
		if (!session) throw new Error('Das Konto ist gerade nicht verbunden.');
		await this.run(session, () =>
			setSeen(this.deps.db, session.client, found.mailbox, found.message.uid, seen)
		);
		this.deps.onChanged(found.mailbox.accountId);
	}

	private schedule(accountId: number, session: Session, scope: 'all' | 'inbox') {
		return this.run(session, async () => {
			if (scope === 'all') this.deps.onStatus({ accountId, state: 'syncing' });
			const boxes = await syncMailboxes(this.deps.db, accountId, session.client);
			// The inbox goes last, so it stays selected and IDLE watches it.
			const inbox = boxes.find((box) => box.role === 'inbox');
			const others = scope === 'all' ? boxes.filter((box) => box !== inbox) : [];
			let changed = false;
			for (const box of [...others, ...(inbox ? [inbox] : [])]) {
				const result = await syncMailbox(this.deps.db, session.client, box);
				changed ||= result.added + result.updated + result.removed > 0;
			}
			// A round can also bring new folders.
			if (changed || scope === 'all') this.deps.onChanged(accountId);
			if (scope === 'all') {
				this.failures.delete(accountId);
				this.deps.onStatus({ accountId, state: 'ready' });
			}
		}).catch((error) => this.fail(accountId, session, error));
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
