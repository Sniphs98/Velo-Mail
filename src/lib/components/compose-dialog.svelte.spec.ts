import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { accounts } from '#lib/accounts.svelte.ts';
import { compose } from '#lib/compose.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import ComposeDialog from './compose-dialog.svelte';

describe('ComposeDialog', () => {
	afterEach(() => {
		compose.open = false;
		accounts.list = [];
		delete window.velo;
	});

	it('writes and sends a new message', async () => {
		const api = fakeVelo();
		render(ComposeDialog);
		await compose.start(1);

		await page.getByLabelText('An', { exact: true }).fill('Anna <anna@firma.de>');
		await page.getByLabelText('Betreff').fill('Hallo');
		await page.getByLabelText('Nachricht', { exact: true }).fill('Wie geht es dir?');
		await page.getByRole('button', { name: 'Senden' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(api.mail.send).toHaveBeenCalledWith(
			expect.objectContaining({
				accountId: 1,
				to: 'Anna <anna@firma.de>',
				subject: 'Hallo',
				text: 'Wie geht es dir?',
				attachments: []
			})
		);
	});

	it('starts a reply with recipient, subject and quote, and saves it as a draft', async () => {
		const api = fakeVelo();
		render(ComposeDialog);
		await compose.start(1, { kind: 'reply', messageId: 5 });

		await expect.element(page.getByRole('heading', { name: 'Antworten' })).toBeVisible();
		await expect
			.element(page.getByLabelText('An', { exact: true }))
			.toHaveValue('Anna Becker <anna@firma.de>');
		await expect.element(page.getByLabelText('Betreff')).toHaveValue('Re: Planung');
		expect(
			(page.getByLabelText('Nachricht', { exact: true }).element() as HTMLTextAreaElement).value
		).toContain('> Kannst du drüberschauen?');

		await page.getByLabelText('Nachricht', { exact: true }).fill('Passt!');
		await expect.element(page.getByText('Entwurf gespeichert'), { timeout: 5000 }).toBeVisible();
		expect(api.mail.saveDraft).toHaveBeenCalledWith(
			expect.objectContaining({ replyTo: 5, inReplyTo: '<p@firma.de>', text: 'Passt!' })
		);

		await page.getByRole('button', { name: 'Entwurf verwerfen' }).click();
		expect(api.mail.deleteDraft).toHaveBeenCalledWith(1, 99);
	});

	it("adds the account's signature and swaps it with the sender", async () => {
		fakeVelo();
		accounts.list = [
			{ id: 1, name: 'Privat', email: 'du@beispiel.de', color: '#2563eb', signature: 'Lukas' },
			{
				id: 2,
				name: 'Arbeit',
				email: 'du@firma.de',
				color: '#ea580c',
				signature: 'Lukas\nFirma GmbH'
			}
		];
		render(ComposeDialog);
		await compose.start(1);
		const text = page.getByLabelText('Nachricht', { exact: true });
		await expect.element(text).toHaveValue('\n\n-- \nLukas');

		await page.getByLabelText('Von').selectOptions('2');
		await expect.element(text).toHaveValue('\n\n-- \nLukas\nFirma GmbH');
		expect(compose.draft.accountId).toBe(2);
	});

	it('shows why sending failed and stays open', async () => {
		fakeVelo({
			mail: {
				send: vi.fn(async () => {
					throw new Error(
						"Error invoking remote method 'mail:send': Error: Keine gültige Adresse: Jonas"
					);
				})
			}
		});
		render(ComposeDialog);
		await compose.start(1);
		await page.getByLabelText('An', { exact: true }).fill('Jonas');
		await page.getByRole('button', { name: 'Senden' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Keine gültige Adresse: Jonas');
		await expect.element(page.getByRole('dialog')).toBeVisible();
	});
});
