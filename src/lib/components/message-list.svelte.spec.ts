import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { MessageSummary } from '#lib/api.ts';
import MessageList from './message-list.svelte';

const message = (over: Partial<MessageSummary>): MessageSummary => ({
	id: 1,
	accountId: 1,
	mailboxId: 1,
	fromName: 'Anna Becker',
	fromAddress: 'anna@firma.de',
	to: [],
	subject: 'Planung für nächste Woche',
	snippet: '',
	date: Date.now(),
	seen: false,
	flagged: false,
	hasAttachments: false,
	threadSize: 1,
	...over
});

const accounts = [
	{ id: 1, name: 'Persönlich', email: 'du@beispiel.de', color: '#2563eb' },
	{ id: 2, name: 'Arbeit', email: 'du@firma.de', color: '#ea580c' }
];

describe('MessageList', () => {
	it('shows sender, subject, unread state and opens a message', async () => {
		const onselect = vi.fn();
		render(MessageList, {
			title: 'Alle Posteingänge',
			messages: [
				message({ id: 1, threadSize: 3 }),
				message({ id: 2, fromName: null, fromAddress: 'info@shop.de', subject: '', seen: true })
			],
			accounts,
			selectedId: 2,
			showAccount: true,
			onselect
		});

		const first = page.getByRole('button', { name: /Anna Becker/ });
		await expect.element(first).toHaveTextContent('AB');
		await expect.element(first).toHaveTextContent('3 Nachrichten');
		await expect.element(first).toHaveTextContent('Ungelesen');
		const second = page.getByRole('button', { name: /info@shop.de/ });
		await expect.element(second).toHaveTextContent('(Kein Betreff)');
		await expect.element(second).toHaveAttribute('aria-current', 'true');
		await expect.element(second).not.toHaveTextContent('Ungelesen');

		await first.click();
		expect(onselect).toHaveBeenCalledWith(1);
	});

	it('says when the folder is empty', async () => {
		render(MessageList, {
			title: 'Archiv',
			messages: [],
			accounts,
			selectedId: null,
			showAccount: false,
			onselect: () => {}
		});
		await expect.element(page.getByText('Keine E-Mails')).toBeVisible();
	});
});
