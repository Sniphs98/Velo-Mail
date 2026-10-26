import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { accounts } from '#lib/accounts.svelte.ts';
import { page as language } from '#lib/language.ts';
import { localStorageKey } from '#lib/paraglide/runtime.js';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import { inLocale } from '#lib/testing/german.ts';
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
			{
				id: 3,
				name: 'Privat',
				email: 'du@beispiel.de',
				color: '#2563eb',
				signature: '',
				notify: 'all' as const
			}
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
			{
				id: 3,
				name: 'Privat',
				email: 'du@beispiel.de',
				color: '#2563eb',
				signature: '',
				notify: 'all' as const
			}
		];
		render(SettingsDialog, { open: true });
		await page.getByRole('tab', { name: 'Konten' }).click();
		await expect.element(page.getByRole('radio', { name: 'Blau' })).toBeChecked();
		await page.getByRole('radio', { name: 'Grün' }).click();
		expect(api.accounts.update).toHaveBeenCalledWith(3, { color: '#16a34a' });
		await expect.element(page.getByRole('radio', { name: 'Grün' })).toBeChecked();
	});

	it('mutes the notifications of an account, or its newsletters', async () => {
		const api = fakeVelo();
		accounts.list = [
			{
				id: 3,
				name: 'Privat',
				email: 'du@beispiel.de',
				color: '#2563eb',
				signature: '',
				notify: 'all' as const
			}
		];
		render(SettingsDialog, { open: true });
		await page.getByRole('tab', { name: 'Konten' }).click();
		await page
			.getByRole('combobox', { name: 'Benachrichtigungen' })
			.selectOptions('Alle außer Newsletter');
		expect(api.accounts.update).toHaveBeenCalledWith(3, { notify: 'important' });
		await vi.waitFor(() => expect(accounts.list[0].notify).toBe('important'));
	});

	it('switches the language and reloads the page', async () => {
		const api = fakeVelo();
		const reload = vi.spyOn(language, 'reload').mockImplementation(() => {});
		render(SettingsDialog, { open: true });

		await page.getByRole('combobox', { name: 'Sprache' }).selectOptions('English');
		await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
		expect(api.settings.set).toHaveBeenCalledWith({ language: 'en' });
		expect(localStorage.getItem(localStorageKey)).toBe('en');

		await page.getByRole('combobox', { name: 'Sprache' }).selectOptions('System');
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
		expect(localStorage.getItem(localStorageKey)).toBeNull();
		reload.mockRestore();
	});

	it('speaks English', async () => {
		fakeVelo();
		await inLocale('en', async () => {
			render(SettingsDialog, { open: true });
			await expect.element(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
			await expect.element(page.getByRole('switch', { name: 'Notifications' })).toBeVisible();
			await expect.element(page.getByRole('radio', { name: 'Dark' })).toBeVisible();
		});
	});
});
