import { expect, test } from '@playwright/test';
import { DAVClient } from 'tsdav';
import { radicale } from '../scripts/radicale.mjs';
import { addTestCalendar, launchApp } from './app';

/** As iCalendar UTC, e.g. 20261103T140000Z. */
const ical = (date: Date) =>
	date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z');

test('reminds of an event and shows its day on click', async () => {
	const name = `Erinnerungen ${Date.now()}`;
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
	// Starts in four minutes; the reminder five minutes before went off a minute ago.
	const start = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 4 * 60_000);
	await client.createCalendarObject({
		calendar,
		filename: 'standup.ics',
		iCalString: [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Test//DE',
			'BEGIN:VEVENT',
			`UID:standup-${Date.now()}`,
			'DTSTAMP:20261001T000000Z',
			`DTSTART:${ical(start)}`,
			`DTEND:${ical(new Date(start.getTime() + 15 * 60_000))}`,
			'SUMMARY:Standup',
			'LOCATION:Raum 2',
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			'DESCRIPTION:Standup',
			'TRIGGER:-PT5M',
			'END:VALARM',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		].join('\r\n')
	});

	const { app, window: page } = await launchApp();
	// Notifications are caught in the main process instead of shown.
	await app.evaluate(({ Notification }) => {
		const caught: Electron.Notification[] = [];
		Object.assign(globalThis, { caught });
		Notification.isSupported = () => true;
		Notification.prototype.show = function (this: Electron.Notification) {
			caught.push(this);
		};
	});
	const view = await addTestCalendar(page, name);
	await page.getByRole('tab', { name: 'Mail' }).click();

	await expect
		.poll(
			() =>
				app.evaluate(() =>
					(globalThis as unknown as { caught: Electron.Notification[] }).caught.map(
						(n) => `${n.title} | ${n.body}`
					)
				),
			{ timeout: 15_000 }
		)
		.toEqual([expect.stringMatching(/^Standup \| Heute \d\d:\d\d–\d\d:\d\d · Raum 2$/)]);

	// A click shows the calendar on that day.
	await app.evaluate(() =>
		(globalThis as unknown as { caught: Electron.Notification[] }).caught[0].emit('click')
	);
	await expect(view.getByRole('radio', { name: 'Tag' })).toBeChecked();
	await expect(view.getByRole('button', { name: /Standup/ })).toBeVisible();
	await app.close();
});
