import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { mail } from '#lib/mail.svelte.ts';
import { sidebar } from '#lib/sidebar.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import Sidebar from './sidebar.svelte';

const account = {
	id: 7,
	name: 'Arbeit',
	email: 'du@firma.de',
	color: '#ea580c',
	signature: '',
	notify: 'all' as const
};

describe('Sidebar', () => {
	afterEach(() => {
		delete window.velo;
		mail.mailboxes = [];
		mail.view = { inboxes: true };
		sidebar.collapsed = [];
		sidebar.pins = {};
		localStorage.clear();
	});

	it('shows the inbox and account actions', async () => {
		const onaddaccount = vi.fn();
		render(Sidebar, { onaddaccount, onaddcalendar: () => {}, onsettings: () => {} });
		await expect.element(page.getByRole('button', { name: 'Alle Posteingänge' })).toBeVisible();
		await page.getByRole('button', { name: 'Konto hinzufügen' }).click();
		expect(onaddaccount).toHaveBeenCalled();
	});

	it('shows the app version from the main process', async () => {
		fakeVelo();
		render(Sidebar, { onaddaccount: () => {}, onaddcalendar: () => {}, onsettings: () => {} });
		await expect.element(page.getByText('Velo Mail 1.2.3')).toBeVisible();
	});

	it('lists the accounts and removes one from its menu', async () => {
		const list = vi.fn().mockResolvedValueOnce([account]).mockResolvedValue([]);
		const api = fakeVelo({ accounts: { list } });
		render(Sidebar, { onaddaccount: () => {}, onaddcalendar: () => {}, onsettings: () => {} });

		await expect.element(page.getByText('du@firma.de')).toBeVisible();
		await page.getByRole('button', { name: 'Optionen für Arbeit' }).click();
		await page.getByRole('menuitem', { name: 'Konto entfernen' }).click();

		expect(api.accounts.remove).toHaveBeenCalledWith(7);
		await expect.element(page.getByText('du@firma.de')).not.toBeInTheDocument();
	});

	it("lists each account's folders with unread counts and opens one", async () => {
		const messages = vi.fn(async () => []);
		fakeVelo({
			accounts: { list: vi.fn(async () => [account]) },
			mail: {
				messages,
				mailboxes: vi.fn(async () => [
					{
						id: 1,
						accountId: 7,
						name: 'Posteingang',
						role: 'inbox' as const,
						unread: 3,
						unreadNewsletters: 0
					},
					{
						id: 2,
						accountId: 7,
						name: 'Gesendet',
						role: 'sent' as const,
						unread: 0,
						unreadNewsletters: 0
					},
					{
						id: 3,
						accountId: 7,
						name: 'Spam',
						role: 'junk' as const,
						unread: 9,
						unreadNewsletters: 0
					}
				])
			}
		});
		await mail.load();
		render(Sidebar, { onaddaccount: () => {}, onaddcalendar: () => {}, onsettings: () => {} });

		await expect
			.element(page.getByRole('button', { name: 'Alle Posteingänge' }))
			.toHaveTextContent('3');
		await expect.element(page.getByRole('button', { name: 'Posteingang 3' })).toBeVisible();
		// No unread count for junk and trash.
		await expect.element(page.getByRole('button', { name: 'Spam', exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Gesendet', exact: true }).click();
		expect(messages).toHaveBeenLastCalledWith({ mailboxId: 2 });
		await expect
			.element(page.getByRole('button', { name: 'Gesendet', exact: true }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('folds an account to its pinned folders, and remembers it', async () => {
		fakeVelo({
			accounts: { list: vi.fn(async () => [account]) },
			mail: {
				mailboxes: vi.fn(async () => [
					{
						id: 1,
						accountId: 7,
						name: 'Posteingang',
						role: 'inbox' as const,
						unread: 0,
						unreadNewsletters: 0
					},
					{
						id: 2,
						accountId: 7,
						name: 'Gesendet',
						role: 'sent' as const,
						unread: 0,
						unreadNewsletters: 0
					},
					{
						id: 3,
						accountId: 7,
						name: 'Spam',
						role: 'junk' as const,
						unread: 0,
						unreadNewsletters: 0
					}
				])
			}
		});
		await mail.load();
		render(Sidebar, { onaddaccount: () => {}, onaddcalendar: () => {}, onsettings: () => {} });
		const folder = (name: string) => page.getByRole('button', { name, exact: true });

		await page.getByRole('button', { name: 'Arbeit zuklappen' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Arbeit aufklappen' }))
			.toHaveAttribute('aria-expanded', 'false');
		// Nothing is pinned at first: folded, the account shows no folder.
		await expect.element(folder('Posteingang')).not.toBeInTheDocument();
		await expect.element(folder('Spam')).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Arbeit aufklappen' }).click();
		await page.getByRole('button', { name: 'Anpinnen: Spam' }).click();
		await page.getByRole('button', { name: 'Arbeit zuklappen' }).click();
		await expect.element(folder('Spam')).toBeVisible();
		await expect.element(folder('Posteingang')).not.toBeInTheDocument();
		await expect.element(folder('Gesendet')).not.toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('velo:sidebar')!)).toEqual({
			collapsed: [7],
			pins: { 3: true }
		});

		await page.getByRole('button', { name: 'Nicht mehr anpinnen: Spam' }).click();
		await expect.element(folder('Spam')).not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Arbeit aufklappen' }).click();
		await expect.element(folder('Gesendet')).toBeVisible();
		await expect.element(folder('Posteingang')).toBeVisible();
	});
});
