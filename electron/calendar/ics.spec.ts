import { describe, expect, it } from 'vitest';
import { eventIcs, occurrences, parseEvent } from './ics';

const wrap = (...lines: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//DE', ...lines, 'END:VCALENDAR'].join('\r\n');

const berlin = [
	'BEGIN:VTIMEZONE',
	'TZID:Europe/Berlin',
	'BEGIN:DAYLIGHT',
	'TZOFFSETFROM:+0100',
	'TZOFFSETTO:+0200',
	'TZNAME:CEST',
	'DTSTART:19700329T020000',
	'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
	'END:DAYLIGHT',
	'BEGIN:STANDARD',
	'TZOFFSETFROM:+0200',
	'TZOFFSETTO:+0100',
	'TZNAME:CET',
	'DTSTART:19701025T030000',
	'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
	'END:STANDARD',
	'END:VTIMEZONE'
];

describe('parseEvent', () => {
	it('reads a timed event in its time zone', () => {
		const event = parseEvent(
			wrap(
				...berlin,
				'BEGIN:VEVENT',
				'UID:a1',
				'DTSTAMP:20261001T000000Z',
				'DTSTART;TZID=Europe/Berlin:20261027T090000',
				'DTEND;TZID=Europe/Berlin:20261027T103000',
				'SUMMARY:Planung',
				'LOCATION:Raum 2',
				'END:VEVENT'
			)
		);
		expect(event).toMatchObject({
			uid: 'a1',
			summary: 'Planung',
			location: 'Raum 2',
			allDay: false,
			recurring: false,
			recurUntil: null
		});
		// 09:00 in Berlin after the switch to winter time is 08:00 UTC.
		expect(event!.start.toISOString()).toBe('2026-10-27T08:00:00.000Z');
		expect(event!.end.toISOString()).toBe('2026-10-27T09:30:00.000Z');
	});

	it('knows all-day events and when a series ends', () => {
		const allDay = parseEvent(
			wrap(
				'BEGIN:VEVENT',
				'UID:b',
				'DTSTART;VALUE=DATE:20261031',
				'SUMMARY:Halloween',
				'END:VEVENT'
			)
		)!;
		expect(allDay.allDay).toBe(true);
		expect(allDay.end.getTime() - allDay.start.getTime()).toBe(24 * 60 * 60 * 1000);

		const counted = parseEvent(
			wrap(
				'BEGIN:VEVENT',
				'UID:c',
				'DTSTART:20261026T080000Z',
				'DTEND:20261026T090000Z',
				'RRULE:FREQ=WEEKLY;COUNT=3',
				'END:VEVENT'
			)
		)!;
		expect(counted.recurring).toBe(true);
		expect(counted.recurUntil?.toISOString()).toBe('2026-11-09T09:00:00.000Z');

		const endless = parseEvent(
			wrap('BEGIN:VEVENT', 'UID:d', 'DTSTART:20261026T080000Z', 'RRULE:FREQ=DAILY', 'END:VEVENT')
		)!;
		expect(endless.recurUntil).toBeNull();
	});

	it('gives up on what is not a calendar', () => {
		expect(parseEvent('kein Kalender')).toBeNull();
		expect(parseEvent(wrap('BEGIN:VTODO', 'UID:x', 'END:VTODO'))).toBeNull();
	});
});

describe('occurrences', () => {
	const weekly = wrap(
		'BEGIN:VEVENT',
		'UID:w',
		'DTSTART:20261026T080000Z',
		'DTEND:20261026T090000Z',
		'RRULE:FREQ=WEEKLY',
		'EXDATE:20261102T080000Z',
		'SUMMARY:Jour fixe',
		'END:VEVENT',
		'BEGIN:VEVENT',
		'UID:w',
		'RECURRENCE-ID:20261109T080000Z',
		'DTSTART:20261109T130000Z',
		'DTEND:20261109T140000Z',
		'SUMMARY:Jour fixe (verschoben)',
		'END:VEVENT'
	);

	it('expands a series in a range, skipping removed and moving changed ones', () => {
		const found = occurrences(weekly, new Date('2026-10-26T00:00Z'), new Date('2026-11-17T00:00Z'));
		expect(found.map((o) => [o.start.toISOString(), o.summary])).toEqual([
			['2026-10-26T08:00:00.000Z', 'Jour fixe'],
			['2026-11-09T13:00:00.000Z', 'Jour fixe (verschoben)'],
			['2026-11-16T08:00:00.000Z', 'Jour fixe']
		]);
		expect(found[0].recurrenceId).toBeDefined();
	});

	it('returns a single event only when it overlaps the range', () => {
		const single = wrap(
			'BEGIN:VEVENT',
			'UID:s',
			'DTSTART:20261026T080000Z',
			'DTEND:20261026T090000Z',
			'END:VEVENT'
		);
		expect(
			occurrences(single, new Date('2026-10-26T08:30Z'), new Date('2026-10-27T00:00Z'))
		).toHaveLength(1);
		expect(
			occurrences(single, new Date('2026-10-26T09:00Z'), new Date('2026-10-27T00:00Z'))
		).toHaveLength(0);
	});
});

describe('eventIcs', () => {
	it('writes a new event that reads back the same', () => {
		const ics = eventIcs(
			{
				summary: 'Zahnarzt',
				location: 'Hauptstraße 1',
				start: Date.UTC(2026, 9, 28, 14),
				end: Date.UTC(2026, 9, 28, 15),
				allDay: false
			},
			undefined,
			'neu-1'
		);
		expect(ics).toContain('UID:neu-1');
		expect(ics).toMatch(/\r\n$/);
		expect(parseEvent(ics)).toMatchObject({
			uid: 'neu-1',
			summary: 'Zahnarzt',
			location: 'Hauptstraße 1',
			start: new Date(Date.UTC(2026, 9, 28, 14)),
			end: new Date(Date.UTC(2026, 9, 28, 15))
		});
	});

	it('changes an existing event and keeps its recurrence and the rest', () => {
		const original = wrap(
			'BEGIN:VEVENT',
			'UID:w',
			'DTSTART:20261026T080000Z',
			'DTEND:20261026T090000Z',
			'RRULE:FREQ=WEEKLY',
			'SUMMARY:Alt',
			'LOCATION:Weg',
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			'TRIGGER:-PT15M',
			'END:VALARM',
			'END:VEVENT'
		);
		const changed = eventIcs(
			{
				summary: 'Neu',
				start: Date.UTC(2026, 9, 26, 9),
				end: Date.UTC(2026, 9, 26, 10),
				allDay: false
			},
			original
		);
		expect(changed).toContain('RRULE:FREQ=WEEKLY');
		expect(changed).toContain('BEGIN:VALARM');
		expect(changed).not.toContain('LOCATION');
		expect(changed).toContain('SEQUENCE:0');
		expect(parseEvent(changed)).toMatchObject({ uid: 'w', summary: 'Neu', recurring: true });
	});

	it('writes all-day events as dates', () => {
		const ics = eventIcs({
			summary: 'Urlaub',
			start: new Date(2026, 11, 24).getTime(),
			end: new Date(2026, 11, 27).getTime(),
			allDay: true
		});
		expect(ics).toContain('DTSTART;VALUE=DATE:20261224');
		expect(ics).toContain('DTEND;VALUE=DATE:20261227');
	});
});
