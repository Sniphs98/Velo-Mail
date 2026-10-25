import { expect, test } from '@playwright/test';
import { sendTestMail } from '../scripts/greenmail.mjs';
import { addTestAccount, clearInbox, launchApp } from './app';

test('only the panes scroll, and their widths stay as set', async () => {
	await clearInbox();
	for (let i = 0; i < 25; i++) await sendTestMail({ subject: `Rundbrief ${i}` });
	const first = await launchApp();
	let page = first.window;
	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	await expect(list.getByRole('listitem')).toHaveCount(25);

	// Many messages must not make the page itself taller than the window.
	expect(
		await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
	).toBe(0);

	const before = (await list.boundingBox())!.width;
	const divider = page.getByRole('separator', { name: 'Breite der Nachrichtenliste' });
	const box = (await divider.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + 300);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 100, box.y + 300, { steps: 5 });
	await page.mouse.up();
	const after = (await list.boundingBox())!.width;
	expect(after).toBeGreaterThan(before + 90);
	await first.app.close();

	const second = await launchApp(first.userData);
	page = second.window;
	await expect(page.getByRole('region', { name: 'Nachrichtenliste' })).toBeVisible();
	expect(
		Math.round((await page.getByRole('region', { name: 'Nachrichtenliste' }).boundingBox())!.width)
	).toBe(Math.round(after));
	await second.app.close();
});
