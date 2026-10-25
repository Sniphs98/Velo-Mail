import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { accounts } from '#lib/accounts.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import SettingsDialog from './settings-dialog.svelte';

describe('SettingsDialog', () => {
	afterEach(() => {
		accounts.list = [];
		delete window.velo;
	});

	it('changes the theme, notifications and the tray', async () => {
		const api = fakeVelo();
		render(SettingsDialog, { open: true });

		await expect.element(page.getByRole('radio', { name: 'System' })).toBeChecked();
		await page.getByRole('radio', { name: 'Dunkel' }).click();
		await expect.element(page.getByRole('radio', { name: 'Dunkel' })).toBeChecked();
		expect(api.settings.set).toHaveBeenCalledWith({ theme: 'dark' });

		await expect.element(page.getByRole('switch', { name: 'Benachrichtigungen' })).toBeChecked();
		await page.getByRole('switch', { name: 'Benachrichtigungen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ notifications: false });
		await expect.element(page.getByRole('switch', { name: 'Terminerinnerungen' })).toBeChecked();
		await page.getByRole('switch', { name: 'Terminerinnerungen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ reminders: false });
		await page.getByRole('switch', { name: 'Im Hintergrund weiterlaufen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ tray: true });
		await page.getByRole('switch', { name: 'Absenderbilder' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ avatars: false });
		await page.getByRole('switch', { name: 'Nach Updates suchen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ updates: false });
		await page.getByRole('button', { name: 'Jetzt suchen' }).click();
		await expect.element(page.getByText('Velo Mail ist auf dem neuesten Stand.')).toBeVisible();
	});

	it('saves the name and signature of an account', async () => {
		const api = fakeVelo();
		accounts.list = [
			{ id: 3, name: 'Privat', email: 'du@beispiel.de', color: '#2563eb', signature: '' }
		];
		render(SettingsDialog, { open: true });
		await page.getByRole('tab', { name: 'Konten' }).click();

		const save = page.getByRole('button', { name: 'Speichern' });
		await expect.element(save).toBeDisabled();
		await page.getByLabelText('Signatur').fill('Viele Grüße\nLukas');
		await save.click();

		await expect.element(page.getByRole('status')).toHaveTextContent('Gespeichert');
		expect(api.accounts.update).toHaveBeenCalledWith(3, {
			name: 'Privat',
			signature: 'Viele Grüße\nLukas'
		});
		expect(accounts.list[0].signature).toBe('Viele Grüße\nLukas');
		await expect.element(save).toBeDisabled();

		await page.getByLabelText('Name').fill('');
		await expect.element(save).toBeDisabled();
	});

	it('changes the color of an account at once', async () => {
		const api = fakeVelo();
		accounts.list = [
			{ id: 3, name: 'Privat', email: 'du@beispiel.de', color: '#2563eb', signature: '' }
		];
		render(SettingsDialog, { open: true });
		await page.getByRole('tab', { name: 'Konten' }).click();
		await expect.element(page.getByRole('radio', { name: 'Blau' })).toBeChecked();
		await page.getByRole('radio', { name: 'Grün' }).click();
		expect(api.accounts.update).toHaveBeenCalledWith(3, { color: '#16a34a' });
		await expect.element(page.getByRole('radio', { name: 'Grün' })).toBeChecked();
	});
});
