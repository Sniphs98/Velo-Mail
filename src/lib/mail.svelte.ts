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
	status = $state<Record<number, SyncStatus>>({});

	selected = $derived(this.messages.find((m) => m.id === this.selectedId) ?? null);
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
		await this.load();
	}

	isShowing(view: MessageQuery) {
		return 'mailboxId' in view
			? 'mailboxId' in this.view && this.view.mailboxId === view.mailboxId
			: 'inboxes' in this.view;
	}

	/** Opens a message and marks it read. */
	async open(id: number) {
		this.selectedId = id;
		const message = this.messages.find((m) => m.id === id);
		if (!message || message.seen) return;
		message.seen = true;
		const box = this.mailboxes.find((m) => m.id === message.mailboxId);
		if (box) box.unread = Math.max(0, box.unread - 1);
		await velo()?.mail.setSeen(id, true);
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
