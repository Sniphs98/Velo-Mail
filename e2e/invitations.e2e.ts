import { expect, test } from '@playwright/test';
import { DAVClient } from 'tsdav';
import { greenMail, sendTestMail, withImap } from '../scripts/greenmail.mjs';
import { radicale } from '../scripts/radicale.mjs';
import { addTestAccount, addTestCalendar, clearInbox, launchApp } from './app';

const { organizer } = greenMail;

/** Today at `hour` local time, as iCalendar UTC. */
function today(hour: number) {
	const date = new Date();
	date.setHours(hour, 0, 0, 0);
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z');
}

/** Subjects and calendar parts of the mails in the organizer's inbox. */
function organizerInbox(clear = false) {
	return withImap(async (client) => {
		const lock = await client.getMailboxLock('INBOX');
		const found: string[] = [];
		try {
			if (!client.mailbox || client.mailbox.exists === 0) return found;
			if (clear) {
				await client.messageDelete('1:*');
				return found;
			}
			for await (const message of client.fetch('1:*', { source: true })) {
				found.push(message.source!.toString());
			}
		} finally {
			lock.release();
		}
		return found;
	}, organizer);
}

test('accepts an invitation from a mail into the calendar and answers the organizer', async () => {
	test.setTimeout(60_000);
	await clearInbox();
	await organizerInbox(true);

	const name = `Einladungen ${Date.now()}`;
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

	const uid = `${crypto.randomUUID()}@beispiel.test`;
	await sendTestMail({
		from: `Lea <${organizer.email}>`,
		subject: 'Einladung: Retro',
		text: 'Du bist zur Retro eingeladen.',
		icalEvent: {
			method: 'REQUEST',
			content: [
				'BEGIN:VCALENDAR',
				'VERSION:2.0',
				'PRODID:-//Test//DE',
				'METHOD:REQUEST',
				'BEGIN:VEVENT',
				`UID:${uid}`,
				'DTSTAMP:20261020T080000Z',
				'SEQUENCE:0',
				`DTSTART:${today(15)}`,
				`DTEND:${today(16)}`,
				'SUMMARY:Retro',
				'LOCATION:Küche',
				`ORGANIZER;CN=Lea:mailto:${organizer.email}`,
				`ATTENDEE;CN=Lea;PARTSTAT=ACCEPTED:mailto:${organizer.email}`,
				`ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${greenMail.user.email}`,
				'END:VEVENT',
				'END:VCALENDAR',
				''
			].join('\r\n')
		}
	});

	const { app, window: page } = await launchApp();
	await expect(await addTestAccount(page)).toBeHidden();

	// Connect the calendar first.
	const view = await addTestCalendar(page, name);

	// Open the invitation and accept it.
	await page.getByRole('tab', { name: 'Mail' }).click();
	const list = page.getByRole('region', { name: 'Nachrichtenliste' });
	await list.getByRole('button', { name: /Einladung: Retro/ }).click({ timeout: 10_000 });
	const card = page.getByRole('region', { name: 'Einladung' });
	await expect(card).toContainText('Retro');
	await expect(card).toContainText('15:00–16:00');
	await expect(card).toContainText('Küche');
	// The only calendar is taken; with several, a list offers them.
	await card.getByRole('button', { name: 'Zusagen' }).click();
	await expect(card.getByRole('status')).toContainText('Du hast zugesagt.', { timeout: 10_000 });

	// In the calendar on the server, with the answer in it.
	const stored = (await client.fetchCalendarObjects({ calendar })).map((o) => String(o.data));
	expect(stored).toHaveLength(1);
	expect(stored[0]).toMatch(/PARTSTAT=ACCEPTED[^\r\n]*:mailto:anna@beispiel\.test/i);

	// Lea got the answer.
	await expect
		.poll(async () => (await organizerInbox()).join('\n'), { timeout: 10_000 })
		.toMatch(/method=REPLY/);
	expect((await organizerInbox()).join('\n')).toContain('Subject: Zugesagt: Retro');

	// And the calendar view shows it.
	await page.getByRole('tab', { name: 'Kalender' }).click();
	await expect(view.getByRole('button', { name: /Retro/ })).toBeVisible();
	await app.close();
});
