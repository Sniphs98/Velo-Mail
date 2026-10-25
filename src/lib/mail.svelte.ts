import {
	velo,
	type Mailbox,
	type MessageQuery,
	type MessageSummary,
	type SearchFilters,
	type SearchQuery,
	type SyncStatus
} from '#lib/api.ts';
import { isSearching, noFilters } from '#lib/search.ts';

/**
 * True if `next` differs from `current`. Syncing a large folder reports a
 * change after every batch; replacing equal data would redraw the list and
 * the open conversation each time.
 */
function differs<T>(current: T, next: T) {
	return JSON.stringify($state.snapshot(current)) !== JSON.stringify(next);
}

/** Folders, the message list and the open message; kept fresh by the main process. */
class Mail {
	mailboxes = $state<Mailbox[]>([]);
	messages = $state<MessageSummary[]>([]);
	view = $state<MessageQuery>({ inboxes: true });
	selectedId = $state<number | null>(null);
	/** The open conversation, oldest first. */
	thread = $state<MessageSummary[]>([]);
	status = $state<Record<number, SyncStatus>>({});
	/** The words searched for; with them or with filters the list shows results. */
	query = $state('');
	filters = $state<SearchFilters>({ ...noFilters });

	/** The search as the main process takes it. */
	get searchQuery(): SearchQuery {
		return { ...$state.snapshot(this.filters), text: this.query.trim() };
	}

	get searching() {
		return isSearching(this.searchQuery);
	}

	unreadInboxes = $derived(
		this.mailboxes.filter((m) => m.role === 'inbox').reduce((sum, m) => sum + m.unread, 0)
	);

	async load() {
		const api = velo();
		if (!api) return;
		const search = this.searchQuery;
		const selected = this.selectedId;
		const [mailboxes, messages, thread] = await Promise.all([
			api.mail.mailboxes(),
			isSearching(search) ? api.mail.search(search) : api.mail.messages($state.snapshot(this.view)),
			// The open conversation may have new replies or fetched contents.
			selected === null ? undefined : api.mail.thread(selected)
		]);
		// A newer search may have started meanwhile.
		if (JSON.stringify(search) !== JSON.stringify(this.searchQuery)) return;
		if (differs(this.mailboxes, mailboxes)) this.mailboxes = mailboxes;
		if (differs(this.messages, messages)) this.messages = messages;
		if (
			thread &&
			thread.length > 0 &&
			this.selectedId === selected &&
			differs(this.thread, thread)
		) {
			this.thread = thread;
		}
	}

	async search(query: string) {
		this.query = query;
		this.selectedId = null;
		this.thread = [];
		await this.load();
	}

	/** Narrows the search by account, sender, time and more. */
	async filter(filters: SearchFilters) {
		this.filters = filters;
		this.selectedId = null;
		this.thread = [];
		await this.load();
	}

	/** Searches the servers for older messages; returns how many were found. */
	async searchServer() {
		const found = (await velo()?.mail.searchServer(this.searchQuery)) ?? 0;
		await this.load();
		return found;
	}

	async show(view: MessageQuery) {
		this.query = '';
		this.filters = { ...noFilters };
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

	/**
	 * Moves the open conversation's messages in the listed folder(s) to the
	 * archive or trash, then opens the next conversation.
	 */
	async moveOpen(to: 'archive' | 'trash') {
		const view = this.view;
		const listed = new Set(
			'mailboxId' in view
				? [view.mailboxId]
				: this.mailboxes.filter((m) => m.role === 'inbox').map((m) => m.id)
		);
		const ids = this.thread.filter((m) => listed.has(m.mailboxId)).map((m) => m.id);
		if (this.selectedId !== null && ids.length === 0) ids.push(this.selectedId);
		if (ids.length === 0) return;
		const index = this.messages.findIndex((m) => m.id === this.selectedId);
		const next = this.messages[index + 1] ?? this.messages[index - 1];
		this.messages = this.messages.filter((m) => m.id !== this.selectedId);
		this.selectedId = null;
		this.thread = [];
		await velo()?.mail.move(ids, to);
		if (next) await this.open(next.id);
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
