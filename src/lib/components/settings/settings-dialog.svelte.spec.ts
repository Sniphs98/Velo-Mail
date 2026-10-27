import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { accounts } from '#lib/accounts.svelte.ts';
import { dialogs, type SettingsPage } from '#lib/dialogs.svelte.ts';
import { page as language } from '#lib/language.ts';
import { localStorageKey } from '#lib/paraglide/runtime.js';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import { inLocale } from '#lib/testing/german.ts';
import SettingsDialog from './settings-dialog.svelte';
import { pages } from './pages.ts';

const privat = () => ({
	id: 3,
	name: 'Privat',
	email: 'du@beispiel.de',
	color: '#2563eb',
	signature: '',
	notify: 'all' as const
});

function open(settingsPage: SettingsPage = 'general') {
	dialogs.settingsPage = settingsPage;
	dialogs.settings = true;
	return render(SettingsDialog);
}

const nav = (name: string) =>
	page.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name });

describe('SettingsDialog', () => {
	afterEach(() => {
		accounts.list = [];
		dialogs.settings = false;
		dialogs.tidy = false;
		dialogs.settingsAccount = undefined;
		dialogs.addCalendar = false;
		delete window.velo;
	});

	it('shows every page from the navigation', async () => {
		fakeVelo();
		open();
		await expect.element(page.getByRole('heading', { name: 'Allgemein', level: 2 })).toBeVisible();
		for (const info of pages) {
			await nav(info.label()).click();
			await expect.element(nav(info.label())).toHaveAttribute('aria-current', 'page');
			await expect
				.element(page.getByRole('heading', { name: info.label(), level: 2 }))
				.toBeVisible();
		}
	});

	it('finds pages by what is on them', async () => {
		fakeVelo();
		open();
		await page.getByRole('searchbox', { name: 'Einstellungen durchsuchen' }).fill('signatur');
		await expect.element(nav('Konten')).toBeVisible();
		await expect.element(nav('Allgemein')).not.toBeInTheDocument();
		await page.getByRole('searchbox').fill('xyz');
		await expect.element(page.getByText('Nichts gefunden.')).toBeVisible();
	});

	it('changes the theme, notifications, the tray, avatars and updates', async () => {
		const api = fakeVelo();
		open('appearance');

		await expect.element(page.getByRole('radio', { name: 'System' })).toBeChecked();
		await page.getByRole('radio', { name: 'Dunkel' }).click();
		await expect.element(page.getByRole('radio', { name: 'Dunkel' })).toBeChecked();
		expect(api.settings.set).toHaveBeenCalledWith({ theme: 'dark' });

		await nav('Benachrichtigungen').click();
		await expect.element(page.getByRole('switch', { name: 'Benachrichtigungen' })).toBeChecked();
		await page.getByRole('switch', { name: 'Benachrichtigungen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ notifications: false });
		await expect.element(page.getByRole('switch', { name: 'Terminerinnerungen' })).toBeChecked();
		await page.getByRole('switch', { name: 'Terminerinnerungen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ reminders: false });

		await nav('Allgemein').click();
		await page.getByRole('switch', { name: 'Im Hintergrund weiterlaufen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ tray: true });

		await nav('Datenschutz').click();
		await page.getByRole('switch', { name: 'Absenderbilder' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ avatars: false });

		await nav('Updates & Info').click();
		await expect.element(page.getByText('1.2.3')).toBeVisible();
		await page.getByRole('switch', { name: 'Nach Updates suchen' }).click();
		expect(api.settings.set).toHaveBeenCalledWith({ updates: false });
		await page.getByRole('button', { name: 'Jetzt suchen' }).click();
		await expect.element(page.getByText('Velo Mail ist auf dem neuesten Stand.')).toBeVisible();
	});

	it('saves the name and signature of an account', async () => {
		const api = fakeVelo();
		accounts.list = [privat()];
		open('accounts');

		const save = page.getByRole('button', { name: 'Speichern' });
		await expect.element(save).toBeDisabled();
		await page.getByRole('textbox', { name: 'Signatur' }).fill('Viele Grüße\nLukas');
		await expect.element(page.getByText('Viele Grüße')).toBeVisible();
		await save.click();

		await expect.element(page.getByRole('status')).toHaveTextContent('Gespeichert');
		expect(api.accounts.update).toHaveBeenCalledWith(3, {
			name: 'Privat',
			signature: 'Viele Grüße\nLukas'
		});
		expect(accounts.list[0].signature).toBe('Viele Grüße\nLukas');
		await expect.element(save).toBeDisabled();

		await page.getByRole('textbox', { name: 'Name' }).fill('');
		await expect.element(save).toBeDisabled();
	});

	it('shows the chosen account beside the list', async () => {
		fakeVelo();
		accounts.list = [privat(), { ...privat(), id: 4, name: 'Arbeit', email: 'du@firma.de' }];
		open('accounts');
		await expect.element(page.getByRole('region', { name: 'du@beispiel.de' })).toBeVisible();
		await page.getByRole('button', { name: /Arbeit/ }).click();
		await expect.element(page.getByRole('region', { name: 'du@firma.de' })).toBeVisible();
		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Arbeit');
	});

	it('changes the color of an account at once', async () => {
		const api = fakeVelo();
		accounts.list = [privat()];
		open('accounts');
		await expect.element(page.getByRole('radio', { name: 'Blau' })).toBeChecked();
		await page.getByRole('radio', { name: 'Grün' }).click();
		expect(api.accounts.update).toHaveBeenCalledWith(3, { color: '#16a34a' });
		await expect.element(page.getByRole('radio', { name: 'Grün' })).toBeChecked();
	});

	it('mutes the notifications of an account, or its newsletters', async () => {
		const api = fakeVelo();
		accounts.list = [privat()];
		open('accounts');
		await page
			.getByRole('combobox', { name: 'Benachrichtigungen' })
			.selectOptions('Alle außer Newsletter');
		expect(api.accounts.update).toHaveBeenCalledWith(3, { notify: 'important' });
		await vi.waitFor(() => expect(accounts.list[0].notify).toBe('important'));

		await nav('Benachrichtigungen').click();
		await page.getByRole('combobox', { name: 'du@beispiel.de' }).selectOptions('Keine');
		expect(api.accounts.update).toHaveBeenCalledWith(3, { notify: 'none' });
	});

	it('removes an account only after asking', async () => {
		const api = fakeVelo();
		accounts.list = [privat()];
		open('accounts');
		await page.getByRole('button', { name: 'Konto entfernen' }).click();
		await expect
			.element(page.getByRole('dialog', { name: 'du@beispiel.de entfernen?' }))
			.toBeVisible();
		expect(api.accounts.remove).not.toHaveBeenCalled();
		await page
			.getByRole('dialog', { name: 'du@beispiel.de entfernen?' })
			.getByRole('button', { name: 'Konto entfernen' })
			.click();
		expect(api.accounts.remove).toHaveBeenCalledWith(3);
	});

	it('lists, changes and removes sender rules', async () => {
		const api = fakeVelo({
			mail: {
				senderRules: vi.fn(async () => [{ address: 'news@shop.de', rule: 'newsletter' as const }])
			}
		});
		open('inbox');
		const rule = page.getByRole('combobox', { name: 'Einordnung für news@shop.de' });
		await expect.element(rule).toHaveValue('newsletter');
		await rule.selectOptions('Nie Newsletter');
		expect(api.mail.setSenderRule).toHaveBeenCalledWith('news@shop.de', 'primary');
		await page.getByRole('button', { name: 'Regel für news@shop.de entfernen' }).click();
		expect(api.mail.setSenderRule).toHaveBeenCalledWith('news@shop.de', null);
	});

	it('opens tidying up newsletters', async () => {
		fakeVelo();
		open('inbox');
		await page.getByRole('button', { name: 'Newsletter aufräumen' }).click();
		expect(dialogs.settings).toBe(false);
		expect(dialogs.tidy).toBe(true);
		expect(dialogs.tidyAccounts).toEqual([]);
	});

	it('manages the calendars', async () => {
		const api = fakeVelo({
			calendar: {
				sources: vi.fn(async () => [
					{ id: 1, name: 'iCloud', serverUrl: 'https://caldav.icloud.com', username: 'anna' }
				]),
				calendars: vi.fn(async () => [
					{ id: 7, sourceId: 1, name: 'Privat', color: '#2563eb', enabled: true }
				])
			}
		});
		open('calendars');
		await page.getByRole('switch', { name: 'Privat' }).click();
		expect(api.calendar.updateCalendar).toHaveBeenCalledWith(7, { enabled: false });
		await page
			.getByRole('radiogroup', { name: 'Farbe von Privat' })
			.getByRole('radio', { name: 'Grün' })
			.click();
		expect(api.calendar.updateCalendar).toHaveBeenCalledWith(7, { color: '#16a34a' });

		await page.getByRole('button', { name: 'Kalender entfernen' }).click();
		await page
			.getByRole('dialog', { name: 'iCloud entfernen?' })
			.getByRole('button', { name: 'Kalender entfernen' })
			.click();
		expect(api.calendar.removeSource).toHaveBeenCalledWith(1);

		await page.getByRole('button', { name: 'Kalender hinzufügen' }).click();
		expect(dialogs.addCalendar).toBe(true);
	});

	it('stops loading the images of a trusted sender', async () => {
		let trusted = ['anna@firma.de'];
		const api = fakeVelo({ mail: { trustedSenders: vi.fn(async () => trusted) } });
		open('privacy');
		await expect.element(page.getByText('anna@firma.de')).toBeVisible();
		trusted = [];
		await page.getByRole('button', { name: 'Bilder von anna@firma.de nicht mehr laden' }).click();
		expect(api.mail.untrustSender).toHaveBeenCalledWith('anna@firma.de');
		await expect.element(page.getByText('Noch keine Absender.')).toBeVisible();
	});

	it('switches the language and reloads the page', async () => {
		const api = fakeVelo();
		const reload = vi.spyOn(language, 'reload').mockImplementation(() => {});
		open();

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
			open('notifications');
			await expect.element(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
			await expect.element(page.getByRole('switch', { name: 'Notifications' })).toBeVisible();
			await page.getByRole('button', { name: 'Appearance' }).click();
			await expect.element(page.getByRole('radio', { name: 'Dark' })).toBeVisible();
		});
	});
});
