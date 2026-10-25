import { expect, test } from '@playwright/test';
import { sendTestMail } from '../scripts/greenmail.mjs';
import { samplePdf } from '../electron/testing/sample-pdf';
import { addTestAccount, clearInbox, launchApp } from './app';

test('searches subject, sender and content', async () => {
	await clearInbox();
	await sendTestMail({
		subject: 'Angebot Website-Relaunch',
		from: 'Thomas Klein <thomas@firma.de>'
	});
	await sendTestMail({
		subject: 'Buchclub',
		from: 'Lea Hoffmann <lea@beispiel.test>',
		text: 'Wir treffen uns diesmal bei mir.'
	});
	await sendTestMail({
		subject: 'Rechnung Oktober',
		from: 'Stadtwerke <rechnung@stadtwerke.de>',
		attachments: [{ filename: 'rechnung.pdf', content: samplePdf('Kundennummer 0815') }]
	});
	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	await expect(list.getByRole('listitem')).toHaveCount(3);

	await page.keyboard.press('Control+k');
	await page.keyboard.type('angeb');
	await expect(list.getByRole('heading', { name: 'Suche' })).toBeVisible();
	await expect(list.getByRole('listitem')).toHaveCount(1);
	await expect(list.getByRole('listitem')).toContainText('Angebot Website-Relaunch');

	// Content (fetched ahead) and the sender filter.
	await list.getByRole('searchbox', { name: 'Suchen' }).fill('treffen von:lea');
	await expect(list.getByRole('listitem')).toHaveCount(1);
	await expect(list.getByRole('listitem')).toContainText('Buchclub');

	// Text inside a PDF attachment (fetched ahead with the content).
	await list.getByRole('searchbox', { name: 'Suchen' }).fill('kundennummer');
	await expect(list.getByRole('listitem')).toHaveCount(1);
	await expect(list.getByRole('listitem')).toContainText('Rechnung Oktober');

	// Filters, also without words: sender, attachments, time.
	await list.getByRole('searchbox', { name: 'Suchen' }).fill('');
	await list.getByRole('button', { name: 'Filter', exact: true }).click();
	await list.getByLabel('Absender').fill('stadtwerke');
	await expect(list.getByRole('heading', { name: 'Suche' })).toBeVisible();
	await expect(list.getByRole('listitem')).toHaveCount(1);
	await expect(list.getByRole('listitem')).toContainText('Rechnung Oktober');
	await list.getByLabel('Absender').fill('');
	await list.getByRole('button', { name: 'Mit Anhang', exact: true }).click();
	await expect(list.getByRole('listitem')).toHaveCount(1);
	await list.getByRole('button', { name: 'Mit Anhang', exact: true }).click();
	// Today: these three, and whatever earlier tests left in "Gesendet" on the server.
	await list.getByRole('combobox', { name: 'Zeitraum' }).selectOption({ label: 'Heute' });
	for (const subject of ['Angebot Website-Relaunch', 'Buchclub', 'Rechnung Oktober']) {
		await expect(list.getByRole('listitem').filter({ hasText: subject })).toHaveCount(1);
	}
	await expect(list.getByText(/^\d+ Treffer in allen Konten$/)).toBeVisible();
	await list.getByRole('button', { name: 'Zurücksetzen' }).click();
	await expect(list.getByRole('heading', { name: 'Alle Posteingänge' })).toBeVisible();

	await list.getByRole('searchbox', { name: 'Suchen' }).fill('gibtsnicht');
	await expect(list.getByText('Keine Treffer')).toBeVisible();
	await list.getByRole('button', { name: 'Auf dem Server weitersuchen' }).click();
	await expect(list.getByRole('status')).toHaveText('Auf dem Server nichts Älteres gefunden');

	await list.getByRole('button', { name: 'Suche löschen' }).click();
	await expect(list.getByRole('heading', { name: 'Alle Posteingänge' })).toBeVisible();
	await expect(list.getByRole('listitem')).toHaveCount(3);
	await app.close();
});
