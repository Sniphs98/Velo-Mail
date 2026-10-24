import { expect, test } from '@playwright/test';
import { greenMail } from '../scripts/greenmail.mjs';
import { addTestAccount, launchApp } from './app';

test('adds an account against a real mail server and keeps it after a restart', async () => {
	const { app, window: page, userData } = await launchApp();

	// A wrong password is reported and nothing is saved.
	const dialog = await addTestAccount(page, 'falsch');
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
