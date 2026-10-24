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
