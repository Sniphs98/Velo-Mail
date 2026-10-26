import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { MessageSummary } from '#lib/api.ts';
import { compose } from '#lib/compose.svelte.ts';
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
	threadSize: 3,
	newsletter: false,
	unsubscribe: null
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
			],
			onreply: () => {},
			onmove: () => {}
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

	it('keeps the open message as it is when the conversation is loaded again', async () => {
		// While a large folder syncs, every batch reloads the open conversation.
		const api = fakeVelo();
		const { rerender } = render(ReadingPane, {
			thread: [message(1, 'Anna', 'Hallo')],
			onreply: () => {},
			onmove: () => {}
		});
		await expect.element(page.getByText('Hallo!')).toBeVisible();
		await rerender({ thread: [message(1, 'Anna', 'Hallo')] });
		await rerender({ thread: [{ ...message(1, 'Anna', 'Hallo'), seen: false }] });
		await expect.element(page.getByText('Hallo!')).toBeVisible();
		expect(api.mail.body).toHaveBeenCalledTimes(1);
	});

	it('offers reply, forward, archive and delete', async () => {
		fakeVelo();
		const onreply = vi.fn();
		const onmove = vi.fn();
		render(ReadingPane, { thread: [message(1, 'Anna', 'Hallo')], onreply, onmove });
		await page.getByRole('button', { name: 'Allen antworten (A)' }).click();
		await page.getByRole('button', { name: 'Weiterleiten (F)' }).click();
		await page.getByRole('button', { name: 'Archivieren (E)' }).click();
		await page.getByRole('button', { name: 'Löschen (Entf)' }).click();
		expect(onreply.mock.calls).toEqual([['replyAll'], ['forward']]);
		expect(onmove.mock.calls).toEqual([['archive'], ['trash']]);
	});

	it('unsubscribes from a newsletter at once where it can', async () => {
		const api = fakeVelo({ mail: { unsubscribe: vi.fn(async () => ({ done: true as const })) } });
		const unsubscribe = 'https://shop.de/abmelden?id=1';
		render(ReadingPane, {
			thread: [{ ...message(1, 'Shop', 'Angebote'), newsletter: true, unsubscribe }],
			onreply: () => {},
			onmove: () => {}
		});
		await page.getByRole('button', { name: 'Abbestellen' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Abgemeldet.');
		expect(api.mail.unsubscribe).toHaveBeenCalledWith(1);
		await expect.element(page.getByRole('button', { name: 'Abbestellen' })).toBeDisabled();
	});

	it('opens the unsubscribe page, or writes the unsubscribe mail', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const unsubscribe = vi.fn(async () => ({
			done: false as const,
			url: 'https://shop.de/abmelden' as string | null
		}));
		fakeVelo({ mail: { unsubscribe } });
		render(ReadingPane, {
			thread: [
				{ ...message(1, 'Shop', 'Angebote'), newsletter: true, unsubscribe: 'https://shop.de' }
			],
			onreply: () => {},
			onmove: () => {}
		});
		await page.getByRole('button', { name: 'Abbestellen' }).click();
		await vi.waitFor(() =>
			expect(open).toHaveBeenCalledWith('https://shop.de/abmelden', '_blank', 'noreferrer')
		);

		unsubscribe.mockResolvedValue({ done: false, url: 'mailto:weg@shop.de?subject=abmelden' });
		await page.getByRole('button', { name: 'Abbestellen' }).click();
		await vi.waitFor(() => expect(compose.open).toBe(true));
		expect(compose.draft).toMatchObject({ accountId: 1, to: 'weg@shop.de', subject: 'abmelden' });
		compose.open = false;
		open.mockRestore();
	});

	it("files the sender's mail as newsletter, or never as one", async () => {
		const api = fakeVelo();
		const { rerender } = render(ReadingPane, {
			thread: [message(1, 'Anna', 'Hallo')],
			onreply: () => {},
			onmove: () => {}
		});
		await page.getByRole('button', { name: 'Mehr' }).click();
		await page.getByRole('menuitem', { name: 'Absender immer als Newsletter einordnen' }).click();
		expect(api.mail.setSenderRule).toHaveBeenCalledWith('anna@beispiel.de', 'newsletter');

		await rerender({ thread: [{ ...message(1, 'Anna', 'Hallo'), newsletter: true }] });
		await page.getByRole('button', { name: 'Mehr' }).click();
		await page.getByRole('menuitem', { name: 'Absender nie als Newsletter einordnen' }).click();
		expect(api.mail.setSenderRule).toHaveBeenLastCalledWith('anna@beispiel.de', 'primary');
	});
});
