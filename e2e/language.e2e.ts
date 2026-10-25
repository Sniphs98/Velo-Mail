import { expect, test } from '@playwright/test';
import { launchApp } from './app';

test('speaks the system language and keeps a chosen one', async () => {
	const first = await launchApp(undefined, 'en');
	let page = first.window;
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('heading', { name: 'Welcome to Velo Mail' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'All inboxes' })).toBeVisible();

	await page.getByRole('button', { name: 'Settings' }).click();
	await page
		.getByRole('dialog', { name: 'Settings' })
		.getByRole('combobox', { name: 'Language' })
		.selectOption('Deutsch');
	// The page reloads in the new language.
	await expect(page.getByRole('heading', { name: 'Willkommen bei Velo Mail' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await first.app.close();

	// The choice outlasts a restart, against the English system.
	const second = await launchApp(first.userData, 'en');
	page = second.window;
	await expect(page.getByRole('heading', { name: 'Willkommen bei Velo Mail' })).toBeVisible();
	await second.app.close();
});
