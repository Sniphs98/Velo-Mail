import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageSummary } from '#lib/api.ts';
import { mail } from '#lib/mail.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';

const message = (id: number, snippet = ''): MessageSummary => ({
	id,
	accountId: 1,
	mailboxId: 1,
	fromName: 'Anna',
	fromAddress: 'anna@firma.de',
	to: [],
	subject: 'Planung',
	snippet,
	date: id,
	seen: true,
	flagged: false,
	hasAttachments: false,
	threadSize: 1,
	newsletter: false,
	unsubscribe: null
});

describe('mail', () => {
	afterEach(() => {
		mail.selectedId = null;
		mail.thread = [];
		delete window.velo;
	});

	it('refreshes the open conversation when the cache changes', async () => {
		let changed = () => {};
		const thread = vi.fn(async () => [message(1)]);
		fakeVelo({
			mail: {
				messages: vi.fn(async () => [message(1)]),
				thread,
				onChanged: vi.fn((listener: () => void) => {
					changed = listener;
					return () => {};
				})
			}
		});
		const stop = mail.connect();
		await mail.open(1);
		expect(mail.thread.map((m) => [m.id, m.snippet])).toEqual([[1, '']]);

		// The content arrived in the background, and a reply.
		thread.mockResolvedValue([message(1, 'Erster Entwurf'), message(2, 'Antwort')]);
		changed();
		await vi.waitFor(() =>
			expect(mail.thread.map((m) => [m.id, m.snippet])).toEqual([
				[1, 'Erster Entwurf'],
				[2, 'Antwort']
			])
		);
		stop();
	});

	it('keeps list and conversation when a change brings nothing new', async () => {
		let changed = () => {};
		const messages = vi.fn(async () => [message(1), message(2)]);
		fakeVelo({
			mail: {
				messages,
				thread: vi.fn(async () => [message(1)]),
				onChanged: vi.fn((listener: () => void) => {
					changed = listener;
					return () => {};
				})
			}
		});
		const stop = mail.connect();
		await mail.open(1);
		await vi.waitFor(() => expect(mail.messages).toHaveLength(2));
		const list = mail.messages;
		const open = mail.thread;

		// Another folder syncs: the cache changed, but not what is shown.
		changed();
		await vi.waitFor(() => expect(messages).toHaveBeenCalledTimes(2));
		await new Promise((resolve) => setTimeout(resolve));
		expect(mail.messages).toBe(list);
		expect(mail.thread).toBe(open);
		stop();
	});

	it('lists the inboxes by tab, other folders whole', async () => {
		const inbox = { id: 1, accountId: 1, name: 'Posteingang', role: 'inbox' as const };
		const sent = { id: 2, accountId: 1, name: 'Gesendet', role: 'sent' as const };
		const messages = vi.fn(async () => [message(1)]);
		fakeVelo({
			mail: {
				mailboxes: vi.fn(async () => [
					{ ...inbox, unread: 5, unreadNewsletters: 3 },
					{ ...sent, unread: 0, unreadNewsletters: 0 }
				]),
				messages
			}
		});
		await mail.show({ inboxes: true });
		expect(messages).toHaveBeenLastCalledWith({ inboxes: true, tab: 'primary' });
		expect(mail.tabbed).toBe(true);
		expect(mail.tabUnread).toEqual({ primary: 2, newsletters: 3 });

		await mail.showTab('newsletters');
		expect(messages).toHaveBeenLastCalledWith({ inboxes: true, tab: 'newsletters' });
		await mail.show({ mailboxId: 1 });
		expect(messages).toHaveBeenLastCalledWith({ mailboxId: 1, tab: 'primary' });
		await mail.show({ mailboxId: 2 });
		expect(messages).toHaveBeenLastCalledWith({ mailboxId: 2 });
		expect(mail.tabbed).toBe(false);
		await mail.show({ inboxes: true });
	});
});
