import { expect, test } from '@playwright/test';
import { sendTestMail } from '../scripts/greenmail.mjs';
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
	await sendTestMail({ subject: 'Rechnung Oktober', from: 'Stadtwerke <rechnung@stadtwerke.de>' });
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

	await list.getByRole('searchbox', { name: 'Suchen' }).fill('gibtsnicht');
	await expect(list.getByText('Keine Treffer')).toBeVisible();
	await list.getByRole('button', { name: 'Auf dem Server weitersuchen' }).click();
	await expect(list.getByRole('status')).toHaveText('Auf dem Server nichts Älteres gefunden');

	await list.getByRole('button', { name: 'Suche löschen' }).click();
	await expect(list.getByRole('heading', { name: 'Alle Posteingänge' })).toBeVisible();
	await expect(list.getByRole('listitem')).toHaveCount(3);
	await app.close();
});
