import { expect, test } from '@playwright/test';
import { sendTestMail } from '../scripts/greenmail.mjs';
import { addTestAccount, clearInbox, launchApp } from './app';

test('keeps newsletters in their own tab and tidies them up by sender', async () => {
	await clearInbox();
	await sendTestMail({ subject: 'Planung', from: 'Anna Becker <anna@firma.de>' });
	// They stay archived on the server: subjects no other test searches for.
	for (const subject of ['Wochendeals', 'Nur heute: 20 %']) {
		await sendTestMail({
			subject,
			from: 'Shop <news@shop.test>',
			headers: { 'List-Unsubscribe': '<mailto:weg@shop.test?subject=abmelden>' }
		});
	}
	const { app, window: page } = await launchApp();

	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	await expect(list.getByRole('button', { name: /Anna Becker/ })).toBeVisible();
	await expect(list.getByRole('button', { name: /Shop/ })).toHaveCount(0);

	await list.getByRole('tab', { name: /Newsletter/ }).click();
	await expect(list.getByRole('button', { name: /Shop/ })).toHaveCount(2);
	await expect(list.getByRole('button', { name: /Anna Becker/ })).toBeHidden();

	await list.getByRole('button', { name: 'Newsletter aufräumen' }).click();
	const shop = page.getByRole('dialog').getByRole('row', { name: 'Shop' });
	await expect(shop.getByRole('cell')).toContainText(['', /Shop/, '2', '2']);
	await shop.getByRole('button', { name: 'Alle aus dem Posteingang archivieren' }).click();
	await expect(shop.getByRole('status')).toHaveText('2 archiviert');
	await page.keyboard.press('Escape');
	await expect(list.getByRole('button', { name: /Shop/ })).toHaveCount(0);
	await app.close();
});
