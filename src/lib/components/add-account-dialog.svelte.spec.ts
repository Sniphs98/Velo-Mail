import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import AddAccountDialog from './add-account-dialog.svelte';

async function fillLogin() {
	await page.getByLabelText('Name').fill('Persönlich');
	await page.getByLabelText('E-Mail-Adresse').fill('du@beispiel.de');
	await page.getByLabelText('Passwort').fill('geheim');
}

describe('AddAccountDialog', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('finds the settings, saves the account and closes', async () => {
		const api = fakeVelo();
		render(AddAccountDialog, { open: true });
		await fillLogin();
		await page.getByRole('button', { name: 'Weiter' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(api.accounts.discover).toHaveBeenCalledWith('du@beispiel.de');
		expect(api.accounts.add).toHaveBeenCalledWith({
			name: 'Persönlich',
			email: 'du@beispiel.de',
			password: 'geheim',
			settings: expect.objectContaining({
				imapHost: 'imap.beispiel.de',
				username: 'du@beispiel.de'
			})
		});
		expect(api.accounts.list).toHaveBeenCalled();
	});

	it('shows the server settings with the reason when the login fails', async () => {
		const add = vi.fn().mockResolvedValueOnce({
			ok: false,
			reason: 'connection',
			connection: { imap: { ok: false, error: 'auth', detail: 'NO' }, smtp: { ok: true } }
		});
		fakeVelo({ accounts: { add } });
		render(AddAccountDialog, { open: true });
		await fillLogin();
		await page.getByRole('button', { name: 'Weiter' }).click();

		await expect
			.element(page.getByText('Empfang (IMAP): Benutzername oder Passwort wurden abgelehnt.'))
			.toBeVisible();
		await expect.element(page.getByText(/App-Passwort/)).toBeVisible();
		await expect
			.element(page.getByLabelText('Empfang (IMAP) Server'))
			.toHaveValue('imap.beispiel.de');

		add.mockResolvedValueOnce({
			ok: true,
			account: {
				id: 1,
				name: 'Persönlich',
				email: 'du@beispiel.de',
				color: '#2563eb',
				signature: ''
			}
		});
		await page.getByLabelText('Empfang (IMAP) Server').fill('mail.beispiel.de');
		await page.getByRole('button', { name: 'Speichern' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(add).toHaveBeenLastCalledWith(
			expect.objectContaining({
				settings: expect.objectContaining({ imapHost: 'mail.beispiel.de' })
			})
		);
	});

	it('warns when there is no keyring for the password', async () => {
		fakeVelo({
			app: {
				info: vi.fn(async () => ({
					name: 'Velo Mail',
					version: '1.2.3',
					platform: 'linux',
					keyring: false
				}))
			}
		});
		render(AddAccountDialog, { open: true });
		await expect.element(page.getByText(/Kein Schlüsselbund gefunden/)).toBeVisible();
	});

	it('says when the account already exists', async () => {
		fakeVelo({ accounts: { add: vi.fn(async () => ({ ok: false, reason: 'exists' }) as const) } });
		render(AddAccountDialog, { open: true });
		await fillLogin();
		await page.getByRole('button', { name: 'Weiter' }).click();
		await expect.element(page.getByText('Dieses Konto ist schon eingerichtet.')).toBeVisible();
	});

	it('can be set up by hand', async () => {
		const api = fakeVelo();
		render(AddAccountDialog, { open: true });
		await fillLogin();
		await page.getByRole('button', { name: 'Manuell einrichten' }).click();

		await expect.element(page.getByLabelText('Benutzername')).toHaveValue('du@beispiel.de');
		await page.getByLabelText('Empfang (IMAP) Server').fill('imap.beispiel.de');
		await page.getByLabelText('Versand (SMTP) Server').fill('smtp.beispiel.de');
		await page.getByLabelText('Versand (SMTP) Port').fill('587');
		await page.getByLabelText('Versand (SMTP) Verschlüsselung').selectOptions('starttls');
		await page.getByRole('button', { name: 'Speichern' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(api.accounts.discover).not.toHaveBeenCalled();
		expect(api.accounts.add).toHaveBeenCalledWith(
			expect.objectContaining({
				settings: expect.objectContaining({ smtpPort: 587, smtpSecurity: 'starttls' })
			})
		);
	});
});
