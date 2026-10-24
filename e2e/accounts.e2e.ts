import { expect, test } from '@playwright/test';
import { greenMail } from '../scripts/greenmail.mjs';
import { launchApp } from './app';

test('adds an account against a real mail server and keeps it after a restart', async () => {
	const { app, window: page, userData } = await launchApp();

	await page.getByRole('button', { name: 'Konto hinzufügen' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Konto hinzufügen' });
	await dialog.getByLabel('Name').fill('Test');
	await dialog.getByLabel('E-Mail-Adresse').fill(greenMail.user.email);
	await dialog.getByLabel('Passwort').fill('falsch');
	await dialog.getByRole('button', { name: 'Manuell einrichten' }).click();

	for (const [kind, port] of [
		['Empfang (IMAP)', greenMail.imapPort],
		['Versand (SMTP)', greenMail.smtpPort]
	] as const) {
		await dialog.getByLabel(`${kind} Server`).fill(greenMail.host);
		await dialog.getByLabel(`${kind} Port`).fill(String(port));
		await dialog.getByLabel(`${kind} Verschlüsselung`).selectOption('none');
	}

	// A wrong password is reported and nothing is saved.
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(
		dialog.getByText('Benutzername oder Passwort wurden abgelehnt.').first()
	).toBeVisible();

	await dialog.getByLabel('Passwort').fill(greenMail.user.password);
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();

	const sidebar = page.getByRole('navigation', { name: 'Konten und Ordner' });
	await expect(sidebar.getByText(greenMail.user.email)).toBeVisible();
	await app.close();

	const restarted = await launchApp(userData);
	await expect(
		restarted.window
			.getByRole('navigation', { name: 'Konten und Ordner' })
			.getByText(greenMail.user.email)
	).toBeVisible();
	await restarted.app.close();
});
