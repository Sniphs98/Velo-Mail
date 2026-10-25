import { expect, test } from '@playwright/test';
import { greenMail, sendTestMail } from '../scripts/greenmail.mjs';
import { addTestAccount, clearInbox, launchApp } from './app';

test('writes, sends, replies to and archives a message', async () => {
	await clearInbox();
	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	const sidebar = page.getByRole('navigation', { name: 'Konten und Ordner' });

	// New message to ourselves; Ctrl+Enter sends.
	await page.keyboard.press('c');
	const composer = page.getByRole('region', { name: 'Neue Nachricht' });
	await composer.getByLabel('An', { exact: true }).fill(`Ich <${greenMail.user.email}>`);
	await composer.getByLabel('Betreff').fill('Termin am Freitag');
	await composer.getByLabel('Nachricht', { exact: true }).fill('Passt dir 10 Uhr?');
	await composer.getByLabel('Nachricht', { exact: true }).press('Control+Enter');
	await expect(composer).toBeHidden();

	const received = list.getByRole('button', { name: /Termin am Freitag/ });
	await expect(received).toBeVisible({ timeout: 10_000 });
	await expect(sidebar.getByRole('button', { name: /^(Sent|Gesendet)/ })).toBeVisible();

	// Reply with "r": recipient, subject and quote are filled in.
	await received.click();
	await page.keyboard.press('r');
	const reply = page.getByRole('region', { name: 'Antworten' });
	await expect(reply.getByLabel('Betreff')).toHaveValue('Re: Termin am Freitag');
	await expect(
		reply.getByRole('textbox', { name: 'Nachricht' }).locator('blockquote')
	).toContainText('Passt dir 10 Uhr?');
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
	await expect(sidebar.getByRole('button', { name: /^(Archive|Archiv)/ })).toBeVisible();
	await app.close();
});

test('forwards a message with its attachment and formatted text', async () => {
	await clearInbox();
	await sendTestMail({
		subject: 'Unterlagen',
		attachments: [{ filename: 'plan.txt', content: 'Der Plan' }]
	});
	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	await list.getByRole('button', { name: /Unterlagen/ }).click();
	await page.keyboard.press('f');

	const composer = page.getByRole('region', { name: 'Weiterleiten' });
	await expect(composer.getByRole('list', { name: 'Anhänge' })).toContainText('plan.txt');
	await composer.getByLabel('An', { exact: true }).fill(greenMail.user.email);
	const editor = composer.getByRole('textbox', { name: 'Nachricht' });
	await editor.press('Control+Home');
	await composer.getByRole('button', { name: 'Fett' }).click();
	// The toolbar must not take the focus away from the text.
	await expect(editor).toBeFocused();
	await editor.pressSequentially('Bitte lesen');
	await composer.getByRole('button', { name: 'Senden' }).click();
	await expect(composer).toBeHidden();

	await list.getByRole('button', { name: /Fwd: Unterlagen/ }).click({ timeout: 10_000 });
	const message = page.getByRole('article', { name: 'Nachricht' });
	await expect(message.getByRole('list', { name: 'Anhänge' })).toContainText('plan.txt');
	const content = message.frameLocator('iframe[title="Inhalt der Nachricht"]');
	await expect(content.locator('strong')).toHaveText('Bitte lesen');
	await app.close();
});
