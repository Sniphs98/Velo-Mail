import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import MailBody from './mail-body.svelte';

describe('MailBody', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('shows HTML in a sandboxed frame and blocks remote images until allowed', async () => {
		fakeVelo({
			mail: {
				body: vi.fn(async () => ({
					html: '<p>Hallo <b>Welt</b></p><img src="https://tracker.example/p.gif"><script>parent.hacked=1</script>',
					text: 'Hallo Welt',
					remoteContent: true,
					attachments: []
				}))
			}
		});
		render(MailBody, { messageId: 1 });

		const frame = page.getByTitle('Inhalt der Nachricht');
		await expect.element(frame).toBeVisible();
		const element = frame.element() as HTMLIFrameElement;
		expect(element.getAttribute('sandbox')).not.toContain('allow-scripts');
		expect(element.srcdoc).toContain('<b>Welt</b>');
		expect(element.srcdoc).not.toContain('<script');
		expect(element.srcdoc).toContain('img-src data:;');
		expect((window as { hacked?: number }).hacked).toBeUndefined();

		await page.getByRole('button', { name: 'Bilder laden' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Bilder laden' }))
			.not.toBeInTheDocument();
		expect((frame.element() as HTMLIFrameElement).srcdoc).toContain('img-src data: https:');
	});

	it('shows plain text as text', async () => {
		fakeVelo();
		render(MailBody, { messageId: 1 });
		await expect.element(page.getByText('Hallo!')).toBeVisible();
		await expect.element(page.getByTitle('Inhalt der Nachricht')).not.toBeInTheDocument();
	});

	it('lists attachments to open or save, and refuses to open runnable ones', async () => {
		const api = fakeVelo({
			mail: {
				body: vi.fn(async () => ({
					html: null,
					text: 'Anbei',
					remoteContent: false,
					attachments: [
						{ id: 5, filename: 'setup.exe', contentType: 'application/x-msdownload', size: 2048 }
					]
				})),
				openAttachment: vi.fn(async () => false)
			}
		});
		render(MailBody, { messageId: 1 });

		await expect
			.element(page.getByRole('list', { name: 'Anhänge' }))
			.toHaveTextContent('setup.exe');
		await expect.element(page.getByRole('list', { name: 'Anhänge' })).toHaveTextContent('2 KB');
		await page.getByRole('button', { name: 'setup.exe öffnen' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('aus Sicherheitsgründen');
		await page.getByRole('button', { name: 'setup.exe speichern' }).click();
		expect(api.mail.saveAttachment).toHaveBeenCalledWith(5);
	});

	it('says when the content could not be loaded', async () => {
		fakeVelo({
			mail: {
				body: vi.fn(async () => {
					throw new Error(
						"Error invoking remote method 'mail:body': Error: Das Konto ist gerade nicht verbunden."
					);
				})
			}
		});
		render(MailBody, { messageId: 1 });
		await expect
			.element(
				page.getByText(
					'Der Inhalt konnte nicht geladen werden: Das Konto ist gerade nicht verbunden.'
				)
			)
			.toBeVisible();
	});
});
