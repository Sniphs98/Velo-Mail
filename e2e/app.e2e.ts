import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
	({ app, window: page } = await launchApp());
});

test.afterAll(async () => {
	await app.close();
});

test('opens the main window with the three panes', async () => {
	await expect(page).toHaveTitle('Velo Mail');
	await expect(page.getByRole('navigation', { name: 'Konten und Ordner' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Alle Posteingänge' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Willkommen bei Velo Mail' })).toBeVisible();
});

test('shows the app version from the main process', async () => {
	const version = await app.evaluate(({ app }) => app.getVersion());
	await expect(page.getByText(`Velo Mail ${version}`)).toBeVisible();
});

test('keeps Node out of the renderer', async () => {
	const exposed = await page.evaluate(() => ({
		require: typeof (globalThis as { require?: unknown }).require,
		process: typeof (globalThis as { process?: unknown }).process,
		velo: Object.keys(window.velo ?? {})
	}));
	expect(exposed).toEqual({ require: 'undefined', process: 'undefined', velo: ['app'] });
});

test('serves the renderer with a content security policy', async () => {
	const violation = await page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				document.addEventListener('securitypolicyviolation', (event) =>
					resolve(event.effectiveDirective)
				);
				fetch('https://example.com').catch(() => {});
			})
	);
	expect(violation).toBe('connect-src');
});

test('does not open new windows or navigate away', async () => {
	await page.evaluate(() => window.open('http://example.com'));
	await page.evaluate(() => (location.href = 'https://example.com'));
	await page.waitForTimeout(500);
	expect(app.windows()).toHaveLength(1);
	expect(page.url()).toMatch(/^app:\/\/velo\//);
});
