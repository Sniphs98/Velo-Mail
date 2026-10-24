import { expect, test } from '@playwright/test';
import { sendTestMail, withImap } from '../scripts/greenmail.mjs';
import { addTestAccount, clearInbox, launchApp } from './app';

test('syncs the inbox, shows new mail right away and marks it read', async () => {
	await clearInbox();
	await sendTestMail({ subject: 'Schon da', from: 'Anna Becker <anna@firma.de>' });
	const { app, window: page } = await launchApp();

	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	const sidebar = page.getByRole('navigation', { name: 'Konten und Ordner' });
	await expect(list.getByRole('button', { name: /Anna Becker/ })).toBeVisible();
	await expect(sidebar.getByRole('button', { name: 'Posteingang 1' })).toBeVisible();

	// Arrives through IDLE, without a manual refresh.
	await sendTestMail({ subject: 'Ganz neu', from: 'Jonas Weber <jonas@beispiel.test>' });
	const fresh = list.getByRole('button', { name: /Jonas Weber/ });
	await expect(fresh).toBeVisible({ timeout: 10_000 });
	await expect(fresh).toContainText('Ungelesen');

	await fresh.click();
	await expect(page.getByRole('heading', { name: 'Ganz neu' })).toBeVisible();
	await expect(fresh).not.toContainText('Ungelesen');
	await expect(sidebar.getByRole('button', { name: 'Posteingang 1' })).toBeVisible();

	// Read on the server too.
	await expect
		.poll(() =>
			withImap(async (client) => {
				const lock = await client.getMailboxLock('INBOX');
				try {
					return ((await client.search({ seen: true, subject: 'Ganz neu' })) || []).length;
				} finally {
					lock.release();
				}
			})
		)
		.toBe(1);
	await app.close();
});

test('shows an HTML mail safely, with its attachment', async () => {
	await clearInbox();
	await sendTestMail({
		subject: 'Newsletter',
		from: 'Shop <news@shop.example>',
		text: 'Unsere Angebote',
		html: `<h1 style="color:#2563eb">Unsere Angebote</h1>
			<img src="https://tracker.example/open.gif" alt="">
			<script>parent.document.title = 'gehackt'</script>
			<a href="https://shop.example">Zum Shop</a>`,
		attachments: [{ filename: 'Katalog.pdf', content: Buffer.from('%PDF-1.4 Katalog') }]
	});
	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();

	const item = page
		.getByRole('region', { name: 'Nachrichtenliste' })
		.getByRole('button', { name: /Shop/ });
	// The preview line comes from the content fetched ahead.
	await expect(item).toContainText('Unsere Angebote');
	await item.click();

	const content = page.frameLocator('iframe[title="Inhalt der Nachricht"]');
	await expect(content.getByRole('heading', { name: 'Unsere Angebote' })).toBeVisible();
	await expect(content.getByRole('link', { name: 'Zum Shop' })).toBeVisible();
	await expect(page.getByText('Externe Bilder wurden blockiert')).toBeVisible();
	await expect(page.getByRole('list', { name: 'Anhänge' })).toContainText('Katalog.pdf');
	await expect(page).toHaveTitle('Velo Mail');
	await app.close();
});

test('shows conversations and moves through them with the keyboard', async () => {
	await clearInbox();
	await sendTestMail({ subject: 'Älteste', from: 'Lea Hoffmann <lea@beispiel.test>' });
	await sendTestMail({
		subject: 'Planung',
		from: 'Anna Becker <anna@firma.de>',
		text: 'Erster Entwurf',
		messageId: '<planung@firma.de>'
	});
	await sendTestMail({
		subject: 'Re: Planung',
		from: 'Jonas Weber <jonas@beispiel.test>',
		text: 'Ich übernehme die Tests',
		inReplyTo: '<planung@firma.de>',
		references: ['<planung@firma.de>']
	});
	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();

	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	const conversation = list.getByRole('button', { name: /Jonas Weber/ });
	await expect(conversation).toContainText('2 Nachrichten');
	await expect(list.getByRole('listitem')).toHaveCount(2);

	await conversation.click();
	const pane = page.getByRole('article', { name: 'Nachricht' });
	await expect(pane.getByRole('heading', { name: 'Planung' })).toBeVisible();
	await expect(pane.getByRole('article', { name: 'Nachricht von Jonas Weber' })).toBeVisible();
	await expect(pane.getByRole('button', { name: /Anna Becker.*Erster Entwurf/ })).toBeVisible();
	// Opening a conversation marks all of it read.
	await expect(conversation).not.toContainText('Ungelesen');

	await page.keyboard.press('j');
	await expect(pane.getByRole('heading', { name: 'Älteste' })).toBeVisible();
	await page.keyboard.press('k');
	await expect(pane.getByRole('heading', { name: 'Planung' })).toBeVisible();
	await page.keyboard.press('u');
	await expect(conversation).toContainText('Ungelesen');

	await page.keyboard.press('Control+k');
	await expect(list.getByRole('searchbox', { name: 'Suchen' })).toBeFocused();
	await app.close();
});
