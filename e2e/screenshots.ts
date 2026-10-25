// Takes the pictures in the README (docs/screenshots): the app in English with
// a demo inbox and calendar. Run with `npm run screenshots`.
import { expect, test, type Page } from '@playwright/test';
import { DAVClient } from 'tsdav';
import { greenMail, withImap } from '../scripts/greenmail.mjs';
import { radicale } from '../scripts/radicale.mjs';
import { launchApp } from './app';

const out = (name: string) => `docs/screenshots/${name}.png`;
const demo = greenMail.demo;
const hour = 3600_000;

interface DemoMail {
	from: string;
	subject: string;
	text: string;
	ago: number;
	seen?: boolean;
	id?: string;
	replyTo?: string;
	attachment?: string;
}

const mails: DemoMail[] = [
	{
		from: 'Maya Chen <maya@northwind.example>',
		subject: 'Design review on Thursday',
		text: 'Hi Alex,\n\nI put the new onboarding screens in the shared folder. Could you have a look before Thursday?\n\nThanks,\nMaya',
		ago: 26 * hour,
		seen: true,
		id: '<review-1@northwind.example>'
	},
	{
		from: 'Jordan Lee <jordan@northwind.example>',
		subject: 'Re: Design review on Thursday',
		text: 'Looks great! Two small things from my side:\n\n1. The welcome text could be a bit shorter.\n2. Can we try the orange accent on the main button?\n\nSee you Thursday at 2.\n\nJordan',
		ago: 0.4 * hour,
		id: '<review-2@northwind.example>',
		replyTo: '<review-1@northwind.example>'
	},
	{
		from: 'Sam Patel <sam@patel.example>',
		subject: 'Lunch tomorrow?',
		text: 'The new ramen place around the corner finally opened. 12:30?',
		ago: 1.5 * hour
	},
	{
		from: 'Olivia Brown <olivia@brown.example>',
		subject: 'Photos from the weekend',
		text: 'Here are the photos from the hike. The view from the top was amazing!',
		ago: 5 * hour,
		attachment: 'summit.jpg'
	},
	{
		from: 'Northwind Billing <billing@northwind.example>',
		subject: 'Your invoice for October',
		text: 'Your invoice #2041 is attached. Thank you for your business.',
		ago: 30 * hour,
		seen: true,
		attachment: 'invoice-2041.pdf'
	},
	{
		from: 'The Weekly Svelte <news@weekly-svelte.example>',
		subject: 'Runes, snippets and a new release',
		text: 'This week: what is new in Svelte, three talks worth watching and a look at SvelteKit remote functions.',
		ago: 52 * hour,
		seen: true
	},
	{
		from: 'Daniel Kim <daniel@kim.example>',
		subject: 'Moving to the new office',
		text: 'The movers come on Friday. Please pack your desk by Thursday evening.',
		ago: 4 * 24 * hour,
		seen: true
	},
	{
		from: 'Priya Nair <priya@nair.example>',
		subject: 'Book club: next pick',
		text: 'Votes are in: we are reading "The Left Hand of Darkness" next.',
		ago: 9 * 24 * hour,
		seen: true
	}
];

function raw(mail: DemoMail, date: Date) {
	const boundary = 'demo-boundary';
	const headers = [
		`From: ${mail.from}`,
		`To: Alex Morgan <${demo.email}>`,
		`Subject: ${mail.subject}`,
		`Date: ${date.toUTCString()}`,
		`Message-ID: ${mail.id ?? `<${Math.random().toString(36).slice(2)}@demo.example>`}`,
		...(mail.replyTo ? [`In-Reply-To: ${mail.replyTo}`, `References: ${mail.replyTo}`] : []),
		'MIME-Version: 1.0'
	];
	if (!mail.attachment) {
		return [...headers, 'Content-Type: text/plain; charset=utf-8', '', mail.text].join('\r\n');
	}
	return [
		...headers,
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
		'',
		`--${boundary}`,
		'Content-Type: text/plain; charset=utf-8',
		'',
		mail.text,
		`--${boundary}`,
		`Content-Type: application/octet-stream; name="${mail.attachment}"`,
		`Content-Disposition: attachment; filename="${mail.attachment}"`,
		'Content-Transfer-Encoding: base64',
		'',
		...(Buffer.alloc(180_000, 7)
			.toString('base64')
			.match(/.{1,76}/g) ?? []),
		`--${boundary}--`
	].join('\r\n');
}

async function fillInbox() {
	await withImap(async (client) => {
		// GreenMail makes the inbox with the first mail; until then there is nothing to clear.
		const lock = await client.getMailboxLock('INBOX').catch(() => null);
		try {
			if (client.mailbox && client.mailbox.exists > 0) await client.messageDelete('1:*');
		} finally {
			lock?.release();
		}
		for (const mail of mails) {
			const date = new Date(Date.now() - mail.ago);
			await client.append('INBOX', raw(mail, date), mail.seen ? ['\\Seen'] : [], date);
		}
	}, demo);
}

/** iCalendar UTC for a day of this week (0 = Monday) at a local time. */
function at(day: number, hours: number, minutes = 0) {
	const date = new Date();
	date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + day);
	date.setHours(hours, minutes, 0, 0);
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z');
}

async function fillCalendar() {
	const client = new DAVClient({
		serverUrl: radicale.url,
		credentials: radicale.user,
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
	await client.login();
	const calendars: Record<string, string> = { Work: '#0d9488', Personal: '#ea580c' };
	for (const [name, color] of Object.entries(calendars)) {
		await client.makeCalendar({
			url: `${client.account!.homeUrl}${name.toLowerCase()}-${Date.now()}/`,
			props: { displayname: name, calendarColor: color }
		});
	}
	const all = await client.fetchCalendars();
	const work = all.find((c) => c.displayName === 'Work')!;
	const personal = all.find((c) => c.displayName === 'Personal')!;
	const events: [typeof work, string, string, string, string?][] = [
		[work, 'Team standup', at(0, 9, 30), at(0, 9, 45), 'FREQ=DAILY;COUNT=5'],
		[work, 'Design review', at(3, 14), at(3, 15, 30)],
		[work, 'Planning', at(1, 10), at(1, 11, 30)],
		[work, '1:1 with Maya', at(2, 15), at(2, 15, 45)],
		[personal, 'Lunch with Sam', at(2, 12, 30), at(2, 13, 30)],
		[personal, 'Climbing', at(4, 18), at(4, 20)],
		[personal, 'Dentist', at(1, 16), at(1, 17)]
	];
	for (const [calendar, summary, start, end, rule] of events) {
		const uid = `${summary.replace(/\W/g, '')}-${Date.now()}`;
		await client.createCalendarObject({
			calendar,
			filename: `${uid}.ics`,
			iCalString: [
				'BEGIN:VCALENDAR',
				'VERSION:2.0',
				'PRODID:-//Velo Mail//Screenshots//EN',
				'BEGIN:VEVENT',
				`UID:${uid}`,
				`DTSTAMP:${start}`,
				`DTSTART:${start}`,
				`DTEND:${end}`,
				`SUMMARY:${summary}`,
				...(rule ? [`RRULE:${rule}`] : []),
				'END:VEVENT',
				'END:VCALENDAR'
			].join('\r\n')
		});
	}
}

async function addAccount(page: Page) {
	await page.getByRole('button', { name: 'Add account' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Add account' });
	await dialog.getByLabel('Name').fill('Alex Morgan');
	await dialog.getByLabel('Email address').fill(demo.email);
	await dialog.getByLabel('Password').fill(demo.password);
	await dialog.getByRole('button', { name: 'Set up manually' }).click();
	for (const [kind, port] of [
		['Incoming (IMAP)', greenMail.imapPort],
		['Outgoing (SMTP)', greenMail.smtpPort]
	] as const) {
		await dialog.getByLabel(`${kind} server`).fill(greenMail.host);
		await dialog.getByLabel(`${kind} port`).fill(String(port));
		await dialog.getByLabel(`${kind} encryption`).selectOption('none');
	}
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
}

test('README screenshots', async () => {
	test.setTimeout(120_000);
	await fillInbox();
	await fillCalendar();
	const { app, window: page } = await launchApp(undefined, 'en');
	await app.evaluate(({ BrowserWindow }) => {
		const window = BrowserWindow.getAllWindows()[0];
		window.setSize(1360, 820);
		window.center();
	});
	await addAccount(page);

	await page.getByText('Jordan Lee').click();
	await expect(page.getByRole('article', { name: 'Message from Jordan Lee' })).toBeVisible();
	// Lets the avatars and the sync indicator settle.
	await page.waitForTimeout(1500);
	await page.screenshot({ path: out('mail') });

	await page.getByRole('button', { name: 'New message' }).first().click();
	const composer = page.getByRole('region', { name: 'New message' });
	await composer.getByRole('combobox', { name: 'To' }).fill('maya@northwind.example');
	await composer.getByLabel('Subject').fill('Onboarding screens');
	await composer
		.getByRole('textbox', { name: 'Message' })
		.pressSequentially('Hi Maya,\nthe new screens look great. Here are my notes:');
	await page.screenshot({ path: out('compose') });
	await composer.getByRole('button', { name: 'Close' }).click();

	await page.getByRole('tab', { name: 'Calendar' }).click();
	const view = page.getByRole('region', { name: 'Calendar' });
	await view.getByRole('button', { name: 'Add calendar' }).click();
	const dialog = page.getByRole('dialog', { name: 'Add calendar' });
	await dialog.getByLabel('Email address or user name').fill(radicale.user.username);
	await dialog.getByLabel('Password').fill(radicale.user.password);
	await dialog.getByLabel('Server (optional)').fill(radicale.url);
	await dialog.getByLabel('Name (optional)').fill('Calendars');
	await dialog.getByRole('button', { name: 'Add' }).click();
	await expect(dialog).toBeHidden();
	await expect(view.getByText('Design review').first()).toBeVisible({ timeout: 10_000 });
	await page.waitForTimeout(500);
	await page.screenshot({ path: out('calendar') });

	await page.getByRole('tab', { name: 'Mail' }).click();
	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByRole('radio', { name: 'Dark' }).click();
	await page.keyboard.press('Escape');
	await page.getByText('Photos from the weekend').click();
	await page.waitForTimeout(500);
	await page.screenshot({ path: out('dark') });
	await app.close();
});
