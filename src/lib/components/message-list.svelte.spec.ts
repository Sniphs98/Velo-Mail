import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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
	{ id: 1, name: 'Persönlich', email: 'du@beispiel.de', color: '#2563eb', signature: '' },
	{ id: 2, name: 'Arbeit', email: 'du@firma.de', color: '#ea580c', signature: '' }
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
		// Without accounts there is nothing to write from.
		await expect
			.element(page.getByRole('button', { name: /Neue Nachricht/ }))
			.not.toBeInTheDocument();
	});

	it('starts a new message from the header', async () => {
		const oncompose = vi.fn();
		render(MessageList, {
			title: 'Posteingang',
			messages: [],
			accounts,
			selectedId: null,
			showAccount: false,
			onselect: () => {},
			oncompose
		});
		await page.getByRole('button', { name: 'Neue Nachricht (C)' }).click();
		expect(oncompose).toHaveBeenCalledOnce();
	});
});

describe('MessageList search', () => {
	it('searches as you type, clears with Escape and searches the server on request', async () => {
		const onsearch = vi.fn();
		const onsearchserver = vi.fn(async () => 2);
		const { rerender } = render(MessageList, {
			title: 'Posteingang',
			messages: [],
			accounts,
			selectedId: null,
			showAccount: false,
			onselect: () => {},
			onsearch,
			onsearchserver
		});
		const field = page.getByRole('searchbox', { name: 'Suchen' });
		await field.fill('angebot');
		await vi.waitFor(() => expect(onsearch).toHaveBeenLastCalledWith('angebot'));

		await rerender({ query: 'angebot' });
		await expect.element(page.getByText('Keine Treffer')).toBeVisible();
		await page.getByRole('button', { name: 'Auf dem Server weitersuchen' }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('2 ältere Nachrichten vom Server geholt');

		await field.click();
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect(onsearch).toHaveBeenLastCalledWith(''));
		await expect.element(field).toHaveValue('');
	});
});
