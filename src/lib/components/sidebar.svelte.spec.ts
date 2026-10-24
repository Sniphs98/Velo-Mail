import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Sidebar from './sidebar.svelte';

describe('Sidebar', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('shows the inbox and account actions', async () => {
		render(Sidebar);
		await expect.element(page.getByRole('link', { name: 'Alle Posteingänge' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Konto hinzufügen' })).toBeVisible();
	});

	it('shows the app version from the main process', async () => {
		window.velo = {
			app: { info: async () => ({ name: 'Velo Mail', version: '1.2.3', platform: 'linux' }) }
		};
		render(Sidebar);
		await expect.element(page.getByText('Velo Mail 1.2.3')).toBeVisible();
	});
});
