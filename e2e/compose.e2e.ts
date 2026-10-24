import { expect, test } from '@playwright/test';
import { greenMail } from '../scripts/greenmail.mjs';
import { addTestAccount, clearInbox, launchApp } from './app';

test('writes, sends, replies to and archives a message', async () => {
	await clearInbox();
	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	const sidebar = page.getByRole('navigation', { name: 'Konten und Ordner' });

	// New message to ourselves; Ctrl+Enter sends.
	await page.keyboard.press('c');
	const composer = page.getByRole('dialog', { name: 'Neue Nachricht' });
	await composer.getByLabel('An', { exact: true }).fill(`Ich <${greenMail.user.email}>`);
	await composer.getByLabel('Betreff').fill('Termin am Freitag');
	await composer.getByLabel('Nachricht', { exact: true }).fill('Passt dir 10 Uhr?');
	await composer.getByLabel('Nachricht', { exact: true }).press('Control+Enter');
	await expect(composer).toBeHidden();

	const received = list.getByRole('button', { name: /Termin am Freitag/ });
	await expect(received).toBeVisible({ timeout: 10_000 });
	await expect(sidebar.getByRole('button', { name: /Sent|Gesendet/ })).toBeVisible();

	// Reply with "r": recipient, subject and quote are filled in.
	await received.click();
	await page.keyboard.press('r');
	const reply = page.getByRole('dialog', { name: 'Antworten' });
	await expect(reply.getByLabel('Betreff')).toHaveValue('Re: Termin am Freitag');
	await expect(reply.getByLabel('Nachricht', { exact: true })).toHaveValue(/> Passt dir 10 Uhr\?/);
	await reply.getByLabel('Nachricht', { exact: true }).press('Control+Home');
	await reply.getByLabel('Nachricht', { exact: true }).pressSequentially('Ja, passt. ');
	await reply.getByRole('button', { name: 'Senden' }).click();
	await expect(reply).toBeHidden();

	// The reply joins the conversation (inbox copy plus the one in "Gesendet").
	await expect(list.getByRole('button', { name: /Termin am Freitag/ })).toContainText(
		'2 Nachrichten',
		{ timeout: 10_000 }
	);

	// "e" archives the whole conversation from the inbox.
	await list.getByRole('button', { name: /Termin am Freitag/ }).click();
	await page.keyboard.press('e');
	await expect(list.getByText('Keine E-Mails')).toBeVisible();
	await expect(sidebar.getByRole('button', { name: /Archive|Archiv/ })).toBeVisible();
	await app.close();
});
