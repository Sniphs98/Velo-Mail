import { ipcErrorMessage } from '#lib/account-messages.ts';
import { velo, type PickedFile } from '#lib/api.ts';
import { replyDraft, type Draft } from '#lib/compose.ts';

/** The message being written; one at a time. */
class Compose {
	open = $state(false);
	draft = $state<Draft>(empty(0));
	attachments = $state<PickedFile[]>([]);
	status = $state<'idle' | 'saving' | 'saved' | 'sending'>('idle');
	error = $state<string>();
	/** Whether anything changed since the last save. */
	dirty = $state(false);

	/** Starts a new message, or a reply/forward of a message. */
	async start(
		accountId: number,
		from?: { kind: 'reply' | 'replyAll' | 'forward'; messageId: number }
	) {
		let draft = empty(accountId);
		if (from) {
			const source = await velo()?.mail.replySource(from.messageId);
			if (source) draft = replyDraft(source, from.kind, from.messageId);
		}
		this.show(draft);
	}

	/** Continues a saved draft. */
	async edit(messageId: number) {
		const source = await velo()?.mail.replySource(messageId);
		if (!source) return;
		const list = (a: { name?: string; address: string }[]) =>
			a.map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(', ');
		this.show({
			accountId: source.accountId,
			to: list(source.to),
			cc: list(source.cc),
			bcc: '',
			subject: source.subject,
			text: source.text,
			references: source.references,
			draftUid: source.uid
		});
	}

	private show(draft: Draft) {
		this.draft = draft;
		this.attachments = [];
		this.status = 'idle';
		this.error = undefined;
		this.dirty = false;
		this.open = true;
	}

	changed() {
		this.dirty = true;
		if (this.status === 'saved') this.status = 'idle';
	}

	async attach() {
		const files = (await velo()?.mail.pickFiles()) ?? [];
		this.attachments.push(...files.filter((f) => !this.attachments.some((a) => a.path === f.path)));
		if (files.length > 0) this.changed();
	}

	detach(path: string) {
		this.attachments = this.attachments.filter((a) => a.path !== path);
		this.changed();
	}

	private message() {
		return { ...$state.snapshot(this.draft), attachments: $state.snapshot(this.attachments) };
	}

	/** Saves to the drafts folder; called while typing and when closing. */
	async save() {
		const api = velo();
		if (!api || !this.dirty || this.status === 'sending') return;
		this.status = 'saving';
		this.dirty = false;
		try {
			const uid = await api.mail.saveDraft(this.message());
			this.draft.draftUid = uid ?? undefined;
			this.status = 'saved';
		} catch (error) {
			this.dirty = true;
			this.status = 'idle';
			this.error = ipcErrorMessage(error);
		}
	}

	async send() {
		const api = velo();
		if (!api) return;
		this.status = 'sending';
		this.error = undefined;
		try {
			await api.mail.send(this.message());
			this.open = false;
			this.status = 'idle';
		} catch (error) {
			this.status = 'idle';
			this.error = ipcErrorMessage(error);
		}
	}

	/** Closes and deletes the saved draft. */
	async discard() {
		const uid = this.draft.draftUid;
		this.open = false;
		this.dirty = false;
		if (uid) await velo()?.mail.deleteDraft(this.draft.accountId, uid);
	}

	/** Closes, keeping what was written as a draft. */
	async close() {
		const hasContent = this.draft.to || this.draft.subject || this.draft.text.trim();
		this.open = false;
		if (hasContent) await this.save();
	}
}

function empty(accountId: number): Draft {
	return { accountId, to: '', cc: '', bcc: '', subject: '', text: '' };
}

export const compose = new Compose();
