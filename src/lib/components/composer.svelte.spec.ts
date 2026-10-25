import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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
		const editor = page.getByRole('textbox', { name: 'Nachricht' });
		await expect
			.element(editor.element().querySelector('blockquote')!)
			.toHaveTextContent('Kannst du drüberschauen?');

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
		const signature = () =>
			page.getByRole('textbox', { name: 'Nachricht' }).element().querySelector('.signature');
		await vi.waitFor(() => expect(signature()?.innerHTML).toBe('<p>-- <br>Lukas</p>'));

		await page.getByLabelText('Von').selectOptions('2');
		await vi.waitFor(() =>
			expect(signature()?.innerHTML).toBe('<p>-- <br>Lukas<br>Firma GmbH</p>')
		);
		expect(compose.draft.accountId).toBe(2);
	});

	it('formats text and sends it with a plain-text version', async () => {
		const api = fakeVelo();
		render(ComposeDialog);
		await compose.start(1);
		await page.getByLabelText('An', { exact: true }).fill('anna@firma.de');
		const editor = page.getByRole('textbox', { name: 'Nachricht' });
		await editor.click();
		await page.getByRole('button', { name: 'Fett' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Fett' }))
			.toHaveAttribute('aria-pressed', 'true');
		await userEvent.keyboard('Wichtig');
		await page.getByRole('button', { name: 'Fett' }).click();
		await userEvent.keyboard(' und normal{Enter}');
		await page.getByRole('button', { name: 'Aufzählung' }).click();
		await userEvent.keyboard('Punkt');
		await page.getByRole('button', { name: 'Senden' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		const [message] = vi.mocked(api.mail.send).mock.calls[0];
		expect(message.html).toBe(
			'<p><strong>Wichtig</strong> und normal</p><ul><li><p>Punkt</p></li></ul>'
		);
		expect(message.text).toBe('Wichtig und normal\n\n- Punkt');
	});

	it('adds a link to the selected text', async () => {
		const api = fakeVelo();
		render(ComposeDialog);
		await compose.start(1);
		await page.getByLabelText('An', { exact: true }).fill('anna@firma.de');
		await page.getByRole('textbox', { name: 'Nachricht' }).click();
		await userEvent.keyboard('Velo{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}');
		await page.getByRole('button', { name: 'Link' }).click();
		await page.getByLabelText('Adresse des Links').fill('velo.example');
		await userEvent.keyboard('{Enter}');
		await page.getByRole('button', { name: 'Senden' }).click();

		const [message] = vi.mocked(api.mail.send).mock.calls[0];
		expect(message.html).toContain(
			'<a target="_blank" rel="noopener noreferrer nofollow" href="https://velo.example">Velo</a>'
		);
		expect(message.text).toBe('Velo (https://velo.example)');
	});

	it('forwards the attachments of the original, each can be removed', async () => {
		const api = fakeVelo({
			mail: {
				replySource: vi.fn(async (id: number) => ({
					messageId: '<p@firma.de>',
					references: [],
					from: { address: 'anna@firma.de' },
					to: [{ address: 'du@beispiel.de' }],
					cc: [],
					subject: 'Unterlagen',
					date: Date.UTC(2026, 9, 24),
					text: 'Anbei',
					html: null,
					attachments: [
						{ id: 7, filename: 'plan.pdf', contentType: 'application/pdf', size: 2048 },
						{ id: 8, filename: 'foto.jpg', contentType: 'image/jpeg', size: 4096 }
					],
					accountId: 1,
					accountEmail: 'du@beispiel.de',
					uid: id,
					isDraft: false
				}))
			}
		});
		render(ComposeDialog);
		await compose.start(1, { kind: 'forward', messageId: 5 });

		await expect.element(page.getByRole('heading', { name: 'Weiterleiten' })).toBeVisible();
		const list = page.getByRole('list', { name: 'Anhänge' });
		await expect.element(list.getByText('plan.pdf')).toBeVisible();
		await page.getByRole('button', { name: 'foto.jpg entfernen' }).click();
		await expect.element(list.getByText('foto.jpg')).not.toBeInTheDocument();

		await page.getByLabelText('An', { exact: true }).fill('jonas@beispiel.de');
		await page.getByRole('button', { name: 'Senden' }).click();
		expect(api.mail.send).toHaveBeenCalledWith(
			expect.objectContaining({ forwardAttachments: [7], subject: 'Fwd: Unterlagen' })
		);
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
