import {
	velo,
	type Mailbox,
	type MessageQuery,
	type MessageSummary,
	type SyncStatus
} from '#lib/api.ts';

/** Folders, the message list and the open message; kept fresh by the main process. */
class Mail {
	mailboxes = $state<Mailbox[]>([]);
	messages = $state<MessageSummary[]>([]);
	view = $state<MessageQuery>({ inboxes: true });
	selectedId = $state<number | null>(null);
	/** The open conversation, oldest first. */
	thread = $state<MessageSummary[]>([]);
	status = $state<Record<number, SyncStatus>>({});

	unreadInboxes = $derived(
		this.mailboxes.filter((m) => m.role === 'inbox').reduce((sum, m) => sum + m.unread, 0)
	);

	async load() {
		const api = velo();
		if (!api) return;
		const [mailboxes, messages] = await Promise.all([
			api.mail.mailboxes(),
			api.mail.messages($state.snapshot(this.view))
		]);
		this.mailboxes = mailboxes;
		this.messages = messages;
	}

	async show(view: MessageQuery) {
		this.view = view;
		this.selectedId = null;
		this.thread = [];
		await this.load();
	}

	isShowing(view: MessageQuery) {
		return 'mailboxId' in view
			? 'mailboxId' in this.view && this.view.mailboxId === view.mailboxId
			: 'inboxes' in this.view;
	}

	/** Opens a conversation and marks its messages read. */
	async open(id: number) {
		const api = velo();
		const row = this.messages.find((m) => m.id === id);
		this.selectedId = id;
		this.thread = row ? [row] : [];
		if (!api) return;
		const thread = await api.mail.thread(id);
		if (this.selectedId !== id) return;
		this.thread = thread;
		const unread = thread.filter((m) => !m.seen);
		if (row) row.seen = true;
		for (const message of unread) message.seen = true;
		await Promise.all(unread.map((m) => api.mail.setSeen(m.id, true)));
	}

	/** Marks the newest message of the open conversation unread again. */
	async markUnread() {
		const latest = this.thread.at(-1);
		const row = this.messages.find((m) => m.id === this.selectedId);
		if (!latest) return;
		latest.seen = false;
		if (row) row.seen = false;
		await velo()?.mail.setSeen(latest.id, false);
	}

	/** Opens the next (1) or previous (-1) conversation in the list. */
	move(step: 1 | -1) {
		if (this.messages.length === 0) return;
		const index = this.messages.findIndex((m) => m.id === this.selectedId);
		const next = index === -1 ? 0 : Math.min(this.messages.length - 1, Math.max(0, index + step));
		if (this.messages[next].id !== this.selectedId) this.open(this.messages[next].id);
	}

	/** Follows changes from the main process; returns the unsubscribe. */
	connect() {
		const api = velo();
		if (!api) return () => {};
		const offChanged = api.mail.onChanged(() => this.load());
		const offStatus = api.mail.onStatus((status) => {
			this.status[status.accountId] = status;
		});
		this.load();
		return () => {
			offChanged();
			offStatus();
		};
	}
}

export const mail = new Mail();
