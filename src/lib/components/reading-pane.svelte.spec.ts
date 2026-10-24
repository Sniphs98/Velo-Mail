import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { MessageSummary } from '#lib/api.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import ReadingPane from './reading-pane.svelte';

const message = (id: number, fromName: string, snippet: string): MessageSummary => ({
	id,
	accountId: 1,
	mailboxId: 1,
	fromName,
	fromAddress: `${fromName.toLowerCase()}@beispiel.de`,
	to: [{ address: 'du@beispiel.de' }],
	subject: 'Planung für nächste Woche',
	snippet,
	date: Date.UTC(2026, 9, id),
	seen: true,
	flagged: false,
	hasAttachments: false,
	threadSize: 3
});

describe('ReadingPane', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('shows the conversation with only the newest message open', async () => {
		fakeVelo();
		render(ReadingPane, {
			thread: [
				message(1, 'Anna', 'Erster Entwurf'),
				message(2, 'Du', 'Sieht gut aus'),
				message(3, 'Jonas', 'Ich übernehme die Tests')
			]
		});

		await expect
			.element(page.getByRole('heading', { name: 'Planung für nächste Woche' }))
			.toBeVisible();
		await expect.element(page.getByRole('article', { name: 'Nachricht von Jonas' })).toBeVisible();
		await expect.element(page.getByText('Hallo!')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Anna.*Erster Entwurf/ })).toBeVisible();
		await expect
			.element(page.getByRole('article', { name: 'Nachricht von Anna' }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: /Anna.*Erster Entwurf/ }).click();
		await expect.element(page.getByRole('article', { name: 'Nachricht von Anna' })).toBeVisible();
	});
});
