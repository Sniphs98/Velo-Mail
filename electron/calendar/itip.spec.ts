import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import {
	calendarIcs,
	parseInvitation,
	replyIcs,
	responseOf,
	sequenceOf,
	withoutCancelled
} from './itip';
import { occurrences } from './ics';

const zone = [
	'BEGIN:VTIMEZONE',
	'TZID:Europe/Berlin',
	'BEGIN:DAYLIGHT',
	'TZOFFSETFROM:+0100',
	'TZOFFSETTO:+0200',
	'DTSTART:19700329T020000',
	'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
	'END:DAYLIGHT',
	'BEGIN:STANDARD',
	'TZOFFSETFROM:+0200',
	'TZOFFSETTO:+0100',
	'DTSTART:19701025T030000',
	'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
	'END:STANDARD',
	'END:VTIMEZONE'
];

function invitation(method: string, event: string[], extra: string[] = []) {
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN',
		`METHOD:${method}`,
		...zone,
		'BEGIN:VEVENT',
		'UID:planung-42@firma.de',
		'DTSTAMP:20261020T080000Z',
		'ORGANIZER;CN=Anna Becker:mailto:anna@firma.de',
		'ATTENDEE;CN=Anna Becker;PARTSTAT=ACCEPTED:mailto:anna@firma.de',
		'ATTENDEE;CN=Du;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:Du@Beispiel.de',
		'ATTENDEE;CN=Jonas;PARTSTAT=TENTATIVE:mailto:jonas@firma.de',
		'SUMMARY:Planung Q4',
		'LOCATION:Raum 3',
		...event,
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		'TRIGGER:-PT15M',
		'END:VALARM',
		'END:VEVENT',
		...extra,
		'END:VCALENDAR',
		''
	].join('\r\n');
}

const request = invitation('REQUEST', [
	'SEQUENCE:0',
	'DTSTART;TZID=Europe/Berlin:20261103T100000',
	'DTEND;TZID=Europe/Berlin:20261103T110000'
]);

const weekly = invitation('REQUEST', [
	'SEQUENCE:1',
	'DTSTART;TZID=Europe/Berlin:20261102T090000',
	'DTEND;TZID=Europe/Berlin:20261102T093000',
	'RRULE:FREQ=WEEKLY;COUNT=4'
]);

function vevents(ics: string) {
	return new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent');
}

describe('parseInvitation', () => {
	it('reads an Outlook invitation', () => {
		const parsed = parseInvitation(request)!;
		expect(parsed).toMatchObject({
			method: 'request',
			uid: 'planung-42@firma.de',
			sequence: 0,
			recurrenceId: null,
			summary: 'Planung Q4',
			location: 'Raum 3',
			allDay: false,
			recurring: false,
			organizer: { name: 'Anna Becker', address: 'anna@firma.de' }
		});
		// 10:00 in Berlin (winter time) is 09:00 UTC.
		expect(parsed.start).toBe(Date.UTC(2026, 10, 3, 9));
		expect(parsed.end).toBe(Date.UTC(2026, 10, 3, 10));
		expect(parsed.attendees).toEqual([
			{ name: 'Anna Becker', address: 'anna@firma.de', status: 'accepted' },
			{ name: 'Du', address: 'du@beispiel.de', status: 'needs-action' },
			{ name: 'Jonas', address: 'jonas@firma.de', status: 'tentative' }
		]);
	});

	it('knows cancellations and answers', () => {
		expect(parseInvitation(request.replace('METHOD:REQUEST', 'METHOD:CANCEL'))?.method).toBe(
			'cancel'
		);
		expect(parseInvitation(request.replace('METHOD:REQUEST', 'METHOD:REPLY'))?.method).toBe(
			'reply'
		);
	});

	it('gives null for text that is no calendar', () => {
		expect(parseInvitation('Hallo')).toBeNull();
		expect(parseInvitation('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')).toBeNull();
	});
});

describe('replyIcs', () => {
	it('answers with only the own attendee and the new status', () => {
		const reply = replyIcs(request, 'du@beispiel.de', 'Du', 'accepted');
		const root = new ICAL.Component(ICAL.parse(reply));
		expect(root.getFirstPropertyValue('method')).toBe('REPLY');
		const [vevent] = root.getAllSubcomponents('vevent');
		expect(vevent.getFirstPropertyValue('uid')).toBe('planung-42@firma.de');
		expect(vevent.getFirstPropertyValue('sequence')).toBe(0);
		const attendees = vevent.getAllProperties('attendee');
		expect(attendees).toHaveLength(1);
		expect(attendees[0].getFirstValue()).toBe('mailto:Du@Beispiel.de');
		expect(attendees[0].getParameter('partstat')).toBe('ACCEPTED');
		expect(attendees[0].getParameter('rsvp')).toBeUndefined();
		expect(vevent.getFirstPropertyValue('organizer')).toBe('mailto:anna@firma.de');
		expect(vevent.getAllSubcomponents('valarm')).toHaveLength(0);
		// The time zone travels along, so DTSTART;TZID= stays readable.
		expect(root.getAllSubcomponents('vtimezone')).toHaveLength(1);
	});

	it('adds the own address if the invitation went to a list', () => {
		const reply = replyIcs(request, 'team@beispiel.de', 'Team', 'tentative');
		const [attendee] = vevents(reply)[0].getAllProperties('attendee');
		expect(attendee.getFirstValue()).toBe('mailto:team@beispiel.de');
		expect(attendee.getParameter('cn')).toBe('Team');
		expect(attendee.getParameter('partstat')).toBe('TENTATIVE');
	});
});

describe('calendarIcs', () => {
	it('stores the event with the own answer and without METHOD', () => {
		const ics = calendarIcs(request, null, 'du@beispiel.de', 'Du', 'tentative');
		expect(ics).not.toMatch(/^METHOD:/m);
		expect(responseOf(ics, 'du@beispiel.de')).toBe('tentative');
		// The others' answers and the alarm stay.
		const [vevent] = vevents(ics);
		expect(vevent.getAllProperties('attendee')).toHaveLength(3);
		expect(vevent.getAllSubcomponents('valarm')).toHaveLength(1);
		expect(ics.endsWith('\r\n')).toBe(true);
		// iCloud and other scheduling servers leave the answer to us.
		expect(vevent.getFirstProperty('organizer')?.getParameter('schedule-agent')).toBe('CLIENT');
	});

	it('replaces the stored series with a new version of it', () => {
		const stored = calendarIcs(weekly, null, 'du@beispiel.de', 'Du', 'accepted');
		const moved = weekly
			.replace('SEQUENCE:1', 'SEQUENCE:2')
			.replaceAll('T090000', 'T140000')
			.replace('T093000', 'T143000');
		const ics = calendarIcs(moved, stored, 'du@beispiel.de', 'Du', 'accepted');
		expect(vevents(ics)).toHaveLength(1);
		expect(sequenceOf(ics)).toBe(2);
		const [first] = occurrences(
			ics,
			new Date(Date.UTC(2026, 10, 1)),
			new Date(Date.UTC(2026, 11, 1))
		);
		expect(first.start).toEqual(new Date(Date.UTC(2026, 10, 2, 13)));
	});

	it('changes only the occurrence an update is about', () => {
		const stored = calendarIcs(weekly, null, 'du@beispiel.de', 'Du', 'accepted');
		const single = invitation('REQUEST', [
			'SEQUENCE:1',
			'RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000',
			'DTSTART;TZID=Europe/Berlin:20261109T120000',
			'DTEND;TZID=Europe/Berlin:20261109T123000'
		]);
		expect(parseInvitation(single)?.recurrenceId).toBe('2026-11-09T09:00:00');
		const ics = calendarIcs(single, stored, 'du@beispiel.de', 'Du', 'accepted');
		expect(vevents(ics)).toHaveLength(2);
		const starts = occurrences(
			ics,
			new Date(Date.UTC(2026, 10, 1)),
			new Date(Date.UTC(2026, 11, 1))
		).map((o) => o.start.toISOString());
		expect(starts).toEqual([
			'2026-11-02T08:00:00.000Z',
			'2026-11-09T11:00:00.000Z',
			'2026-11-16T08:00:00.000Z',
			'2026-11-23T08:00:00.000Z'
		]);
	});
});

describe('withoutCancelled', () => {
	const stored = calendarIcs(weekly, null, 'du@beispiel.de', 'Du', 'accepted');

	it('leaves out a cancelled occurrence', () => {
		const cancel = invitation('CANCEL', [
			'SEQUENCE:2',
			'RECURRENCE-ID;TZID=Europe/Berlin:20261116T090000',
			'DTSTART;TZID=Europe/Berlin:20261116T090000',
			'DTEND;TZID=Europe/Berlin:20261116T093000'
		]);
		const ics = withoutCancelled(stored, cancel)!;
		const starts = occurrences(
			ics,
			new Date(Date.UTC(2026, 10, 1)),
			new Date(Date.UTC(2026, 11, 1))
		).map((o) => o.start.toISOString());
		expect(starts).toEqual([
			'2026-11-02T08:00:00.000Z',
			'2026-11-09T08:00:00.000Z',
			'2026-11-23T08:00:00.000Z'
		]);
	});

	it('gives null when the whole event is cancelled', () => {
		expect(withoutCancelled(stored, weekly.replace('METHOD:REQUEST', 'METHOD:CANCEL'))).toBeNull();
	});
});

describe('responseOf', () => {
	it('finds the own answer, ignoring case', () => {
		expect(responseOf(request, 'jonas@FIRMA.de')).toBe('tentative');
		expect(responseOf(request, 'du@beispiel.de')).toBeNull();
		expect(responseOf(request, 'fremd@beispiel.de')).toBeNull();
	});
});
