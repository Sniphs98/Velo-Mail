import { ipcErrorMessage } from '#lib/account-messages.ts';
import { velo, type PickedFile } from '#lib/api.ts';
import { accounts } from '#lib/accounts.svelte.ts';
import DOMPurify from 'dompurify';
import { replyDraft, type Draft } from '#lib/compose.ts';
import { htmlToText, swapSignature, textToHtml, withSignature } from '#lib/mail-text.ts';

const signatureOf = (accountId: number) =>
	accounts.list.find((account) => account.id === accountId)?.signature ?? '';

/** The message being written; one at a time. */
class Compose {
	open = $state(false);
	draft = $state<Draft>(empty(0));
	attachments = $state<PickedFile[]>([]);
	status = $state<'idle' | 'saving' | 'saved' | 'sending'>('idle');
	error = $state<string>();
	/** Whether anything changed since the last save. */
	dirty = $state(false);
	/** The account whose signature the text holds. */
	private signedAs = 0;

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
		draft.html = withSignature(draft.html, signatureOf(draft.accountId));
		this.show(draft);
	}

	/** After choosing another sender account: exchanges the signature. */
	accountChanged() {
		const { accountId } = this.draft;
		if (accountId === this.signedAs) return;
		this.draft.html = swapSignature(
			this.draft.html,
			signatureOf(this.signedAs),
			signatureOf(accountId)
		);
		this.signedAs = accountId;
		this.changed();
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
			// Drafts written here have HTML; others get it from their text.
			html: source.html ? DOMPurify.sanitize(source.html) : textToHtml(source.text),
			forwarded: source.attachments,
			references: source.references,
			draftUid: source.uid
		});
	}

	private show(draft: Draft) {
		this.draft = draft;
		this.signedAs = draft.accountId;
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

	/** Drops an attachment of the forwarded message or the draft. */
	unforward(id: number) {
		this.draft.forwarded = this.draft.forwarded.filter((a) => a.id !== id);
		this.changed();
	}

	private message() {
		const { forwarded, ...draft } = $state.snapshot(this.draft);
		// The editor keeps an empty line at the end to type into.
		const html = draft.html.replace(/(<p><\/p>)+$/, '');
		return {
			...draft,
			html,
			text: htmlToText(html),
			attachments: $state.snapshot(this.attachments),
			forwardAttachments: forwarded.map((a) => a.id)
		};
	}

	/** Saves to the drafts folder; called while typing and when closing. */
	async save() {
		const api = velo();
		if (!api || !this.dirty || this.status === 'sending') return;
		this.status = 'saving';
		this.dirty = false;
		const message = this.message();
		try {
			const saved = await api.mail.saveDraft(message);
			this.draft.draftUid = saved.uid ?? undefined;
			// The files are in the saved draft now, with new ids; files picked
			// while saving stay picked.
			if (saved.uid) {
				const sent = new Set(message.attachments.map((file) => file.path));
				this.draft.forwarded = saved.attachments;
				this.attachments = this.attachments.filter((file) => !sent.has(file.path));
			}
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
		const hasContent = this.draft.to || this.draft.subject || htmlToText(this.draft.html).trim();
		this.open = false;
		if (hasContent) await this.save();
	}
}

function empty(accountId: number): Draft {
	return { accountId, to: '', cc: '', bcc: '', subject: '', html: '', forwarded: [] };
}

export const compose = new Compose();
