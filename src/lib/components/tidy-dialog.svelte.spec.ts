import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { NewsletterSender } from '#lib/api.ts';
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
		const shop = page.getByRole('listitem', { name: 'Shop' });
		await expect.element(shop).toHaveTextContent('412 Mails, 380 ungelesen');
		await expect.element(shop.getByRole('button', { name: 'Abbestellen' })).toBeVisible();
		await expect
			.element(
				page
					.getByRole('listitem', { name: 'club@verein.de' })
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
		const shop = page.getByRole('listitem', { name: 'Shop' });

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

	it('says when there is nothing to tidy up', async () => {
		fakeVelo();
		render(TidyDialog, { open: true });
		await expect.element(page.getByText('Keine Newsletter gefunden.')).toBeVisible();
	});
});
