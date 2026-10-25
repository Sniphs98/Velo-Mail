import { expect, test } from '@playwright/test';
import { DAVClient } from 'tsdav';
import { radicale } from '../scripts/radicale.mjs';
import { addTestCalendar, launchApp } from './app';

/** The server as another app sees it, with a calendar of this test's own. */
async function server(name: string) {
	const client = new DAVClient({
		serverUrl: radicale.url,
		credentials: radicale.user,
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
	await client.login();
	await client.makeCalendar({
		url: `${client.account!.homeUrl}${encodeURIComponent(name)}/`,
		props: { displayname: name }
	});
	const calendar = (await client.fetchCalendars()).find((c) => c.displayName === name)!;
	return { client, calendar };
}

/** Today at `hour` local time, as iCalendar UTC. */
function today(hour: number) {
	const date = new Date();
	date.setHours(hour, 0, 0, 0);
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z');
}

test('connects a CalDAV calendar, shows its events and creates, changes and deletes one', async () => {
	// A long flow (login, sync, three writes with server checks); the default 30 s is tight.
	test.setTimeout(60_000);
	const name = `Privat ${Date.now()}`;
	const { client, calendar } = await server(name);
	await client.createCalendarObject({
		calendar,
		filename: 'zahnarzt.ics',
		iCalString: [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Test//DE',
			'BEGIN:VEVENT',
			'UID:zahnarzt',
			'DTSTAMP:20261001T000000Z',
			`DTSTART:${today(10)}`,
			`DTEND:${today(11)}`,
			'SUMMARY:Zahnarzt',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		].join('\r\n')
	});

	const { app, window: page } = await launchApp();
	await page.getByRole('tab', { name: 'Kalender' }).click();
	const view = page.getByRole('region', { name: 'Kalender' });
	await expect(view.getByText('Noch kein Kalender verbunden')).toBeVisible();

	await view.getByRole('button', { name: 'Kalender hinzufügen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Kalender hinzufügen' });
	await dialog.getByLabel('E-Mail-Adresse oder Benutzername').fill(radicale.user.username);
	await dialog.getByLabel('Passwort').fill('falsch');
	await dialog.getByLabel('Server (optional)').fill(radicale.url);
	await dialog.getByRole('button', { name: 'Hinzufügen' }).click();
	await expect(dialog.getByRole('alert')).toContainText('Anmeldung wurde abgelehnt');
	await dialog.getByLabel('Passwort').fill(radicale.user.password);
	await dialog.getByRole('button', { name: 'Hinzufügen' }).click();
	await expect(dialog).toBeHidden();

	const sidebar = page.getByRole('navigation', { name: 'Konten und Ordner' });
	await expect(sidebar.getByRole('checkbox', { name })).toBeChecked({ timeout: 10_000 });
	await expect(view.getByRole('button', { name: /Zahnarzt/ })).toBeVisible();

	// Hide and show the calendar again.
	await sidebar.getByRole('checkbox', { name }).uncheck();
	await expect(view.getByRole('button', { name: /Zahnarzt/ })).toBeHidden();
	await sidebar.getByRole('checkbox', { name }).check();
	await expect(view.getByRole('button', { name: /Zahnarzt/ })).toBeVisible();

	// A click into the grid at 14:00 today starts a new event there.
	const column = view.locator(`[data-day="${new Date().setHours(0, 0, 0, 0)}"]`);
	await column.click({ position: { x: 20, y: 14 * 48 + 5 } });
	const editor = page.getByRole('dialog', { name: 'Neuer Termin' });
	await expect(editor.getByLabel('Uhrzeit').first()).toHaveValue('14:00');
	await editor.getByLabel('Titel').fill('Planung');
	await editor.getByLabel('Ort').fill('Büro');
	await editor.getByRole('button', { name: 'Speichern' }).click();
	await expect(editor).toBeHidden();
	await expect(view.getByRole('button', { name: /Planung/ })).toBeVisible();
	const onServer = async () =>
		(await client.fetchCalendarObjects({ calendar })).map((o) => String(o.data)).join('\n');
	expect(await onServer()).toContain('SUMMARY:Planung');

	await view.getByRole('button', { name: /Planung/ }).click();
	const change = page.getByRole('dialog', { name: 'Termin bearbeiten' });
	await change.getByLabel('Titel').fill('Planung Sprint 13');
	await change.getByRole('button', { name: 'Speichern' }).click();
	await expect(view.getByRole('button', { name: /Planung Sprint 13/ })).toBeVisible();
	expect(await onServer()).toContain('SUMMARY:Planung Sprint 13');

	await view.getByRole('button', { name: /Planung Sprint 13/ }).click();
	await page
		.getByRole('dialog', { name: 'Termin bearbeiten' })
		.getByRole('button', { name: 'Löschen' })
		.click();
	await expect(view.getByRole('button', { name: /Planung Sprint 13/ })).toBeHidden();
	expect(await onServer()).not.toContain('Planung');

	// The month shows the remaining event too.
	await view.getByRole('radio', { name: 'Monat' }).click();
	await expect(view.getByRole('button', { name: /Zahnarzt/ })).toBeVisible();
	await app.close();
});

test('changes and deletes single occurrences of a series', async () => {
	test.setTimeout(60_000);
	const name = `Serie ${Date.now()}`;
	const { client, calendar } = await server(name);
	await client.createCalendarObject({
		calendar,
		filename: 'sport.ics',
		iCalString: [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Test//DE',
			'BEGIN:VEVENT',
			`UID:sport-${Date.now()}`,
			'DTSTAMP:20261001T000000Z',
			`DTSTART:${today(8)}`,
			`DTEND:${today(9)}`,
			'RRULE:FREQ=WEEKLY;COUNT=3',
			'SUMMARY:Laufen',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		].join('\r\n')
	});
	const onServer = async () => String((await client.fetchCalendarObjects({ calendar }))[0].data);

	const { app, window: page } = await launchApp();
	const view = await addTestCalendar(page, name);

	// Only this week's run moves to another title.
	await view.getByRole('button', { name: /Laufen/ }).click();
	const editor = page.getByRole('dialog', { name: 'Termin bearbeiten' });
	await expect(editor.getByRole('radio', { name: 'Nur diesen Termin' })).toBeChecked();
	await editor.getByLabel('Titel').fill('Laufen am See');
	await editor.getByRole('button', { name: 'Speichern' }).click();
	await expect(view.getByRole('button', { name: /Laufen am See/ })).toBeVisible();
	expect(await onServer()).toMatch(/RECURRENCE-ID[^\r\n]*\r\n/);

	// Next week is still the series, and only that one is deleted.
	await view.getByRole('button', { name: 'Weiter' }).click();
	await view.getByRole('button', { name: /^Laufen/ }).click();
	await page
		.getByRole('dialog', { name: 'Termin bearbeiten' })
		.getByRole('button', { name: 'Löschen' })
		.click();
	await expect(view.getByRole('button', { name: /Laufen/ })).toBeHidden();
	expect(await onServer()).toMatch(/^EXDATE/m);

	// The week after is untouched.
	await view.getByRole('button', { name: 'Weiter' }).click();
	await expect(view.getByRole('button', { name: /^Laufen/ })).toBeVisible();
	await app.close();
});
