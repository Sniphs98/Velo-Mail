import ICAL from 'ical.js';
import path from 'node:path';
import { DAVClient } from 'tsdav';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { greenMail, sendTestMail, withImap } from '../../scripts/greenmail.mjs';
import { radicale } from '../../scripts/radicale.mjs';
import type { ServerSettings } from '../../src/lib/api';
import type { SecretBox } from '../accounts/service';
import { openDatabase, type Database } from '../db';
import { accounts } from '../db/schema';
import { SyncManager } from '../mail/manager';
import { listMessages } from '../mail/queries';
import { Invitations } from './invitations';
import { CalendarManager } from './manager';
import { CalendarSources } from './service';

// Ben is invited, Lea organizes; both have mailboxes no other test touches.
// The events lie in March 2027, away from the weeks calendar.integration.spec.ts
// looks at: both sync every calendar on the shared Radicale.
const { invitee, organizer } = greenMail;

const settings: ServerSettings = {
	imapHost: greenMail.host,
	imapPort: greenMail.imapPort,
	imapSecurity: 'none',
	smtpHost: greenMail.host,
	smtpPort: greenMail.smtpPort,
	smtpSecurity: 'none',
	username: invitee.email
};

const secrets: SecretBox = {
	encrypt: async (plain) => Buffer.from(plain).reverse(),
	decrypt: async (encrypted) => Buffer.from(encrypted).reverse().toString()
};

function invitation(
	method: string,
	uid: string,
	summary: string,
	{
		sequence = 0,
		start = '20270302T090000Z',
		end = '20270302T100000Z',
		extra = [] as string[]
	} = {}
) {
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Test//DE',
		`METHOD:${method}`,
		'BEGIN:VEVENT',
		`UID:${uid}`,
		'DTSTAMP:20261020T080000Z',
		`SEQUENCE:${sequence}`,
		`DTSTART:${start}`,
		`DTEND:${end}`,
		`SUMMARY:${summary}`,
		`ORGANIZER;CN=Lea:mailto:${organizer.email}`,
		`ATTENDEE;CN=Lea;PARTSTAT=ACCEPTED:mailto:${organizer.email}`,
		`ATTENDEE;CN=Ben;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${invitee.email}`,
		...extra,
		'END:VEVENT',
		'END:VCALENDAR',
		''
	].join('\r\n');
}

async function invite(method: string, ics: string, subject: string) {
	await sendTestMail({
		to: invitee.email,
		from: `Lea <${organizer.email}>`,
		subject,
		text: subject,
		icalEvent: { method, content: ics }
	});
}

async function emptyInbox(user: { email: string; password: string }) {
	await withImap(async (client) => {
		const lock = await client.getMailboxLock('INBOX');
		try {
			if (client.mailbox && client.mailbox.exists > 0) await client.messageDelete('1:*');
		} finally {
			lock.release();
		}
	}, user);
}

/** The iCalendar parts of the mails in Lea's inbox. */
async function repliesToOrganizer() {
	const { default: PostalMime } = await import('postal-mime');
	return withImap(async (client) => {
		const lock = await client.getMailboxLock('INBOX');
		const found: { subject: string; ics: string }[] = [];
		try {
			if (!client.mailbox || client.mailbox.exists === 0) return found;
			for await (const message of client.fetch('1:*', { source: true })) {
				const email = await PostalMime.parse(message.source!);
				const part = email.attachments.find((a) => a.mimeType === 'text/calendar');
				found.push({
					subject: email.subject ?? '',
					ics: part ? Buffer.from(part.content as ArrayBuffer).toString() : ''
				});
			}
		} finally {
			lock.release();
		}
		return found;
	}, organizer);
}

/** The objects in the test's calendar, as another app sees them. */
async function onServer(name: string) {
	const client = new DAVClient({
		serverUrl: radicale.url,
		credentials: radicale.user,
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
	await client.login();
	const calendar = (await client.fetchCalendars()).find((c) => c.displayName === name)!;
	return (await client.fetchCalendarObjects({ calendar })).map((o) => String(o.data));
}

function attendee(ics: string, address: string) {
	const vevent = new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')!;
	return vevent
		.getAllProperties('attendee')
		.find((p) => String(p.getFirstValue()).toLowerCase() === `mailto:${address}`);
}

let db: Database;
let mail: SyncManager;
let calendar: CalendarManager;
let invitations: Invitations;
let accountId: number;
let calendarId: number;
let name: string;

beforeEach(async () => {
	await emptyInbox(invitee);
	await emptyInbox(organizer);
	db = openDatabase(':memory:', path.resolve('drizzle'));
	[{ id: accountId }] = await db
		.insert(accounts)
		.values({
			name: 'Ben',
			email: invitee.email,
			color: '#ea580c',
			...settings,
			secret: Buffer.from('unused')
		})
		.returning();
	mail = new SyncManager({
		db,
		credentials: async () => ({
			name: 'Ben',
			email: invitee.email,
			settings,
			password: invitee.password
		}),
		onChanged: () => {},
		onStatus: () => {}
	});

	// A calendar of its own on the shared Radicale.
	name = `Einladungen ${crypto.randomUUID().slice(0, 8)}`;
	const dav = new DAVClient({
		serverUrl: radicale.url,
		credentials: radicale.user,
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
	await dav.login();
	await dav.makeCalendar({
		url: `${dav.account!.homeUrl}${encodeURIComponent(name)}/`,
		props: { displayname: name }
	});
	const sources = new CalendarSources(db, secrets);
	calendar = new CalendarManager({ db, sources, onChanged: () => {} });
	const added = await sources.add({ ...radicale.user, serverUrl: radicale.url });
	if (!added.ok) throw new Error(added.reason);
	await calendar.syncSource(added.source.id);
	calendarId = (await calendar.calendars()).find((c) => c.name === name)!.id;

	invitations = new Invitations({
		db,
		calendar,
		body: (id) => mail.body(id),
		send: (message, ics) => mail.send(message, ics),
		account: async () => ({ name: 'Ben', email: invitee.email })
	});
});

afterEach(async () => {
	await mail.stopAll();
});

async function inbox() {
	await mail.start(accountId);
	await mail.syncNow(accountId);
	return listMessages(db, { inboxes: true });
}

describe('invitations against GreenMail and Radicale', () => {
	it('accepts an invitation, follows its update and removes it when cancelled', async () => {
		const uid = `${crypto.randomUUID()}@beispiel.test`;
		await invite('REQUEST', invitation('REQUEST', uid, 'Planung'), 'Einladung: Planung');
		const [first] = await inbox();

		expect(await invitations.invitation(first.id)).toMatchObject({
			method: 'request',
			summary: 'Planung',
			start: Date.UTC(2027, 2, 2, 9),
			organizer: { name: 'Lea', address: organizer.email },
			response: null,
			inCalendar: false,
			outdated: false
		});

		await invitations.respond(first.id, 'accepted', calendarId);

		// In the calendar, with the answer in it.
		const [stored] = await onServer(name);
		expect(stored).not.toMatch(/^METHOD:/m);
		expect(attendee(stored, invitee.email)?.getParameter('partstat')).toBe('ACCEPTED');
		expect(await invitations.invitation(first.id)).toMatchObject({
			response: 'accepted',
			inCalendar: true,
			calendarId
		});

		// Lea got the answer.
		const [reply] = await repliesToOrganizer();
		expect(reply.subject).toBe('Zugesagt: Planung');
		expect(reply.ics).toMatch(/^METHOD:REPLY/m);
		expect(attendee(reply.ics, invitee.email)?.getParameter('partstat')).toBe('ACCEPTED');

		// Lea moves the meeting: the update replaces the stored event.
		await invite(
			'REQUEST',
			invitation('REQUEST', uid, 'Planung', {
				sequence: 1,
				start: '20270303T130000Z',
				end: '20270303T140000Z'
			}),
			'Geändert: Planung'
		);
		const messages = await inbox();
		const update = messages.find((m) => m.subject === 'Geändert: Planung')!;
		expect(await invitations.invitation(update.id)).toMatchObject({
			response: 'accepted',
			outdated: false
		});
		await invitations.respond(update.id, 'tentative', null);
		const [moved] = await onServer(name);
		expect(moved).toContain('DTSTART:20270303T130000Z');
		expect(attendee(moved, invitee.email)?.getParameter('partstat')).toBe('TENTATIVE');
		// The first invitation is now the older version.
		expect((await invitations.invitation(first.id))?.outdated).toBe(true);

		// Lea calls it off.
		await invite(
			'CANCEL',
			invitation('CANCEL', uid, 'Planung', { sequence: 2 }),
			'Abgesagt: Planung'
		);
		const cancel = (await inbox()).find((m) => m.subject === 'Abgesagt: Planung')!;
		expect(await invitations.invitation(cancel.id)).toMatchObject({
			method: 'cancel',
			inCalendar: true
		});
		await invitations.removeCancelled(cancel.id);
		expect(await onServer(name)).toEqual([]);
	});

	it('declines without putting anything into the calendar', async () => {
		const uid = `${crypto.randomUUID()}@beispiel.test`;
		await invite('REQUEST', invitation('REQUEST', uid, 'Mittagessen'), 'Einladung: Mittagessen');
		const [message] = await inbox();

		await invitations.respond(message.id, 'declined', calendarId);

		expect(await onServer(name)).toEqual([]);
		expect(await invitations.invitation(message.id)).toMatchObject({
			response: 'declined',
			inCalendar: false
		});
		const [reply] = await repliesToOrganizer();
		expect(reply.subject).toBe('Abgesagt: Mittagessen');
		expect(attendee(reply.ics, invitee.email)?.getParameter('partstat')).toBe('DECLINED');
	});

	it('has nothing for a message without an invitation', async () => {
		await sendTestMail({ to: invitee.email, subject: 'Nur Text' });
		const [message] = await inbox();
		expect(await invitations.invitation(message.id)).toBeNull();
		await expect(invitations.respond(message.id, 'accepted', calendarId)).rejects.toThrow(
			'keine Einladung'
		);
	});
});
