import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import Sidebar from './sidebar.svelte';

const account = { id: 7, name: 'Arbeit', email: 'du@firma.de', color: '#ea580c' };

describe('Sidebar', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('shows the inbox and account actions', async () => {
		const onaddaccount = vi.fn();
		render(Sidebar, { onaddaccount });
		await expect.element(page.getByRole('link', { name: 'Alle Posteingänge' })).toBeVisible();
		await page.getByRole('button', { name: 'Konto hinzufügen' }).click();
		expect(onaddaccount).toHaveBeenCalled();
	});

	it('shows the app version from the main process', async () => {
		fakeVelo();
		render(Sidebar, { onaddaccount: () => {} });
		await expect.element(page.getByText('Velo Mail 1.2.3')).toBeVisible();
	});

	it('lists the accounts and removes one from its menu', async () => {
		const list = vi.fn().mockResolvedValueOnce([account]).mockResolvedValue([]);
		const api = fakeVelo({ accounts: { list } });
		render(Sidebar, { onaddaccount: () => {} });

		await expect.element(page.getByText('du@firma.de')).toBeVisible();
		await page.getByRole('button', { name: 'Optionen für Arbeit' }).click();
		await page.getByRole('menuitem', { name: 'Konto entfernen' }).click();

		expect(api.accounts.remove).toHaveBeenCalledWith(7);
		await expect.element(page.getByText('du@firma.de')).not.toBeInTheDocument();
	});
});
