import { _electron as electron, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { greenMail, withImap } from '../scripts/greenmail.mjs';

/**
 * Starts the built app (out/ and build/, see `npm run build`) with an empty
 * profile of its own, or with `userData` from an earlier start; that is where
 * its database lives.
 */
export async function launchApp(userData = mkdtempSync(path.join(tmpdir(), 'velo-e2e-'))) {
	const args = ['.'];
	// Chromium refuses its sandbox as root (containers, CI).
	if (process.getuid?.() === 0) args.push('--no-sandbox');
	const app = await electron.launch({
		args,
		env: { ...process.env, VELO_USER_DATA: userData },
		// Playwright would pin prefers-color-scheme; the app's theme setting decides.
		colorScheme: null
	});
	const window = await app.firstWindow();
	return { app, window, userData };
}

/** Sets up the GreenMail test account through the dialog. */
export async function addTestAccount(page: Page, password = greenMail.user.password) {
	await page.getByRole('button', { name: 'Konto hinzufügen' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Konto hinzufügen' });
	await dialog.getByLabel('Name').fill('Test');
	await dialog.getByLabel('E-Mail-Adresse').fill(greenMail.user.email);
	await dialog.getByLabel('Passwort').fill(password);
	await dialog.getByRole('button', { name: 'Manuell einrichten' }).click();
	for (const [kind, port] of [
		['Empfang (IMAP)', greenMail.imapPort],
		['Versand (SMTP)', greenMail.smtpPort]
	] as const) {
		await dialog.getByLabel(`${kind} Server`).fill(greenMail.host);
		await dialog.getByLabel(`${kind} Port`).fill(String(port));
		await dialog.getByLabel(`${kind} Verschlüsselung`).selectOption('none');
	}
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	return dialog;
}

/** Empties the test user's inbox on the server. */
export function clearInbox() {
	return withImap(async (client) => {
		const lock = await client.getMailboxLock('INBOX');
		try {
			if (client.mailbox && client.mailbox.exists > 0) await client.messageDelete('1:*');
		} finally {
			lock.release();
		}
	});
}
