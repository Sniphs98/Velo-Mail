import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { update } from '#lib/update.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import UpdateNotice from './update-notice.svelte';

const release = (canSelfUpdate: boolean) => ({
	version: '0.2.0',
	url: 'https://github.com/Sniphs98/Velo-Mail/releases/tag/v0.2.0',
	canSelfUpdate
});

describe('UpdateNotice', () => {
	afterEach(() => {
		update.available = null;
		update.phase = 'idle';
		update.dismissed = false;
		delete window.velo;
	});

	it('shows nothing when up to date', async () => {
		fakeVelo();
		render(UpdateNotice);
		await update.check();
		await expect.element(page.getByRole('region', { name: 'Update' })).not.toBeInTheDocument();
	});

	it('downloads with progress, then offers a restart', async () => {
		let progress: (percent: number) => void = () => {};
		let finish = () => {};
		const api = fakeVelo({
			app: {
				checkUpdate: vi.fn(async () => release(true)),
				onUpdateProgress: vi.fn((listener: (percent: number) => void) => {
					progress = listener;
					return () => {};
				}),
				installUpdate: vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
			}
		});
		render(UpdateNotice);
		await update.check();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Version 0.2.0 ist verfügbar.');

		await page.getByRole('button', { name: 'Aktualisieren' }).click();
		progress(42.4);
		await expect.element(page.getByRole('status')).toHaveTextContent('42 %');
		finish();
		await page.getByRole('button', { name: 'Jetzt neu starten' }).click();
		expect(api.app.restartToUpdate).toHaveBeenCalled();
	});

	it('links to the release page where the app cannot update itself', async () => {
		fakeVelo({ app: { checkUpdate: vi.fn(async () => release(false)) } });
		render(UpdateNotice);
		await update.check();
		await expect
			.element(page.getByRole('link', { name: 'Herunterladen' }))
			.toHaveAttribute('href', 'https://github.com/Sniphs98/Velo-Mail/releases/tag/v0.2.0');
		await page.getByRole('button', { name: 'Später' }).click();
		await expect.element(page.getByRole('region', { name: 'Update' })).not.toBeInTheDocument();
	});

	it('says why a download failed and lets you retry', async () => {
		fakeVelo({
			app: {
				checkUpdate: vi.fn(async () => release(true)),
				installUpdate: vi.fn(async () => {
					throw new Error(
						"Error invoking remote method 'app:install-update': Error: Netzwerkfehler"
					);
				})
			}
		});
		render(UpdateNotice);
		await update.check();
		await page.getByRole('button', { name: 'Aktualisieren' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Netzwerkfehler');
		await expect.element(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
	});
});
