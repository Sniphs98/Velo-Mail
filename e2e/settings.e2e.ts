import { expect, test } from '@playwright/test';
import { addTestAccount, clearInbox, launchApp } from './app';

test('keeps theme, signature and background mode', async () => {
	await clearInbox();
	const first = await launchApp();
	let page = first.window;
	await expect(await addTestAccount(page)).toBeHidden();

	await page.getByRole('button', { name: 'Einstellungen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
	await dialog.getByRole('radio', { name: 'Dunkel' }).click();
	await expect(page.locator('html')).toHaveClass(/\bdark\b/);

	await dialog.getByRole('tab', { name: 'Konten' }).click();
	await dialog.getByLabel('Signatur').fill('Viele Grüße\nAnna');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog.getByRole('status')).toHaveText('Gespeichert');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	await page.keyboard.press('c');
	const composer = page.getByRole('dialog', { name: 'Neue Nachricht' });
	await expect(composer.getByLabel('Nachricht', { exact: true })).toHaveValue(
		'\n\n-- \nViele Grüße\nAnna'
	);
	await composer.getByRole('button', { name: 'Schließen' }).click();
	await first.app.close();

	// Both survive a restart.
	const second = await launchApp(first.userData);
	page = second.window;
	await expect(page.locator('html')).toHaveClass(/\bdark\b/);
	await page.keyboard.press('c');
	await expect(
		page.getByRole('dialog', { name: 'Neue Nachricht' }).getByLabel('Nachricht', { exact: true })
	).toHaveValue('\n\n-- \nViele Grüße\nAnna');
	await page.keyboard.press('Escape');

	// In the background mode closing the window only hides it.
	await page.getByRole('button', { name: 'Einstellungen' }).click();
	await page.getByRole('switch', { name: 'Im Hintergrund weiterlaufen' }).click();
	await expect(page.getByRole('switch', { name: 'Im Hintergrund weiterlaufen' })).toBeChecked();
	const hidden = await second.app.evaluate(async ({ BrowserWindow }) => {
		const [window] = BrowserWindow.getAllWindows();
		window.close();
		await new Promise((resolve) => setTimeout(resolve, 300));
		return !window.isDestroyed() && !window.isVisible();
	});
	expect(hidden).toBe(true);
	await second.app.close();
});
