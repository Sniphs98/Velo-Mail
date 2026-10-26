import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { NewsletterSender } from '#lib/api.ts';
import { accounts } from '#lib/accounts.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import TidyDialog from './tidy-dialog.svelte';

const sender = (over: Partial<NewsletterSender>): NewsletterSender => ({
	address: 'news@shop.de',
	name: 'Shop',
	count: 412,
	unread: 380,
	latest: Date.UTC(2026, 9, 20),
	messageId: 7,
	accountId: 1,
	unsubscribe: 'https://shop.de/stop',
	rule: null,
	...over
});

describe('TidyDialog', () => {
	afterEach(() => {
		accounts.list = [];
		delete window.velo;
	});

	it('lists newsletter senders by amount for the chosen accounts', async () => {
		const api = fakeVelo({
			mail: {
				newsletterSenders: vi.fn(async () => [
					sender({}),
					sender({ address: 'club@verein.de', name: null, count: 3, unread: 0, unsubscribe: null })
				])
			}
		});
		render(TidyDialog, { open: true, accountIds: [1] });
		const shop = page.getByRole('row', { name: 'Shop' });
		await expect.element(shop.getByRole('cell', { name: '412' })).toBeVisible();
		await expect.element(shop.getByRole('cell', { name: '380' })).toBeVisible();
		await expect.element(shop.getByRole('button', { name: 'Abbestellen' })).toBeVisible();
		await expect
			.element(
				page
					.getByRole('row', { name: 'club@verein.de' })
					.getByRole('button', { name: 'Abbestellen' })
			)
			.not.toBeInTheDocument();
		expect(api.mail.newsletterSenders).toHaveBeenCalledWith([1]);
	});

	it("archives, deletes or keeps a sender's mail, and unsubscribes", async () => {
		const api = fakeVelo({
			mail: {
				newsletterSenders: vi.fn(async () => [sender({})]),
				moveFromSender: vi.fn(async () => 412),
				unsubscribe: vi.fn(async () => ({ done: true as const }))
			}
		});
		render(TidyDialog, { open: true, accountIds: [] });
		const shop = page.getByRole('row', { name: 'Shop' });

		await shop.getByRole('button', { name: 'Abbestellen' }).click();
		await expect.element(shop.getByRole('status')).toHaveTextContent('Abgemeldet.');
		expect(api.mail.unsubscribe).toHaveBeenCalledWith(7);

		await shop.getByRole('button', { name: 'Alle aus dem Posteingang archivieren' }).click();
		await expect.element(shop.getByRole('status')).toHaveTextContent('412 archiviert');
		expect(api.mail.moveFromSender).toHaveBeenCalledWith('news@shop.de', [], 'archive');

		await shop.getByRole('button', { name: 'Alle in den Papierkorb' }).click();
		await expect
			.element(shop.getByRole('status'))
			.toHaveTextContent('412 in den Papierkorb verschoben');
		expect(api.mail.moveFromSender).toHaveBeenLastCalledWith('news@shop.de', [], 'trash');

		await shop.getByRole('button', { name: 'Behalten' }).click();
		await vi.waitFor(() =>
			expect(api.mail.setSenderRule).toHaveBeenCalledWith('news@shop.de', 'primary')
		);
	});

	it('sorts by any column', async () => {
		fakeVelo({
			mail: {
				newsletterSenders: vi.fn(async () => [
					sender({}),
					sender({ address: 'a@club.de', name: 'Alpha', count: 3, unread: 3 })
				])
			}
		});
		render(TidyDialog, { open: true });
		const names = () =>
			page
				.getByRole('row')
				.elements()
				.slice(1)
				.map((row) => row.getAttribute('aria-label'));
		await expect.element(page.getByRole('row', { name: 'Alpha' })).toBeVisible();
		expect(names()).toEqual(['Shop', 'Alpha']);
		await page.getByRole('button', { name: 'Absender' }).click();
		expect(names()).toEqual(['Alpha', 'Shop']);
		await page.getByRole('button', { name: 'Mails' }).click();
		expect(names()).toEqual(['Shop', 'Alpha']);
		await page.getByRole('button', { name: 'Mails' }).click();
		expect(names()).toEqual(['Alpha', 'Shop']);
	});

	it('archives the mail of all ticked senders', async () => {
		const api = fakeVelo({
			mail: {
				newsletterSenders: vi.fn(async () => [
					sender({}),
					sender({ address: 'a@club.de', name: 'Alpha' })
				]),
				moveFromSender: vi.fn(async () => 2)
			}
		});
		render(TidyDialog, { open: true });
		await page.getByRole('checkbox', { name: 'Alle auswählen' }).click();
		await expect.element(page.getByText('2 ausgewählt')).toBeVisible();
		await page.getByRole('button', { name: 'Archivieren', exact: true }).click();
		await vi.waitFor(() => expect(api.mail.moveFromSender).toHaveBeenCalledTimes(2));
		expect(api.mail.moveFromSender).toHaveBeenCalledWith('news@shop.de', [], 'archive');
		expect(api.mail.moveFromSender).toHaveBeenCalledWith('a@club.de', [], 'archive');
		await expect.element(page.getByText('2 ausgewählt')).not.toBeInTheDocument();
	});

	it('shows the senders of one account or all', async () => {
		const api = fakeVelo();
		accounts.list = [
			{ id: 1, name: 'A', email: 'a@beispiel.de', color: '#2563eb', signature: '', notify: 'all' },
			{ id: 2, name: 'B', email: 'b@beispiel.de', color: '#16a34a', signature: '', notify: 'all' }
		];
		render(TidyDialog, { open: true, accountIds: [2] });
		const account = page.getByRole('combobox', { name: 'Konto' });
		await expect.element(account).toHaveValue('2');
		await account.selectOptions('Alle Konten');
		await vi.waitFor(() => expect(api.mail.newsletterSenders).toHaveBeenLastCalledWith([]));
	});

	it('says when there is nothing to tidy up', async () => {
		fakeVelo();
		render(TidyDialog, { open: true });
		await expect.element(page.getByText('Keine Newsletter gefunden.')).toBeVisible();
	});
});
