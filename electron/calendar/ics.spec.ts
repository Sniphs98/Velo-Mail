import { describe, expect, it } from 'vitest';
import {
	alarmsIn,
	eventIcs,
	occurrenceIcs,
	occurrences,
	parseEvent,
	withoutOccurrence
} from './ics';

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

describe('reminders', () => {
	const alarm = (...lines: string[]) => ['BEGIN:VALARM', ...lines, 'END:VALARM'];
	const weekly = wrap(
		...berlin,
		'BEGIN:VEVENT',
		'UID:r1',
		'DTSTAMP:20261001T000000Z',
		'DTSTART;TZID=Europe/Berlin:20261102T090000',
		'DTEND;TZID=Europe/Berlin:20261102T100000',
		'RRULE:FREQ=WEEKLY;COUNT=3',
		'SUMMARY:Jour fixe',
		...alarm('ACTION:DISPLAY', 'TRIGGER:-PT15M'),
		...alarm('ACTION:EMAIL', 'TRIGGER:-PT1H'),
		...alarm('ACTION:AUDIO', 'TRIGGER;RELATED=END:PT0S'),
		'END:VEVENT'
	);
	const utc = (day: number, hour: number, minute = 0) =>
		new Date(Date.UTC(2026, 10, day, hour, minute));

	it('reads the first reminder as minutes before the start', () => {
		expect(parseEvent(weekly)?.reminder).toBe(15);
		expect(
			parseEvent(
				wrap('BEGIN:VEVENT', 'UID:x', 'DTSTART:20261102T090000Z', 'SUMMARY:Ohne', 'END:VEVENT')
			)?.reminder
		).toBeNull();
	});

	it('finds the reminders due in a window, for each occurrence', () => {
		// 09:00 Berlin = 08:00 UTC; 15 minutes before, and at the end (09:00 UTC).
		expect(alarmsIn(weekly, utc(2, 7, 40), utc(2, 7, 50)).map((a) => a.at)).toEqual([
			utc(2, 7, 45)
		]);
		expect(alarmsIn(weekly, utc(9, 8, 30), utc(9, 9, 0))).toMatchObject([
			{ at: utc(9, 9), start: utc(9, 8), summary: 'Jour fixe', allDay: false }
		]);
		// E-mail alarms are the server's; nothing else is due an hour before.
		expect(alarmsIn(weekly, utc(16, 6, 50), utc(16, 7, 10))).toEqual([]);
		// After the last occurrence nothing is due.
		expect(alarmsIn(weekly, utc(23, 7, 0), utc(23, 9, 0))).toEqual([]);
	});

	it('handles absolute triggers', () => {
		const ics = wrap(
			'BEGIN:VEVENT',
			'UID:abs',
			'DTSTART;VALUE=DATE:20261105',
			'DTEND;VALUE=DATE:20261106',
			'SUMMARY:Geburtstag',
			...alarm('ACTION:DISPLAY', 'TRIGGER;VALUE=DATE-TIME:20261104T170000Z'),
			'END:VEVENT'
		);
		expect(alarmsIn(ics, utc(4, 16), utc(4, 18))).toMatchObject([
			{ at: utc(4, 17), summary: 'Geburtstag', allDay: true }
		]);
	});

	it('writes, keeps and removes the reminder', () => {
		const input = {
			summary: 'Zahnarzt',
			start: utc(3, 14).getTime(),
			end: utc(3, 15).getTime(),
			allDay: false
		};
		const created = eventIcs({ ...input, reminder: 30 });
		expect(parseEvent(created)?.reminder).toBe(30);
		expect(alarmsIn(created, utc(3, 13), utc(3, 14)).map((a) => a.at)).toEqual([utc(3, 13, 30)]);
		// Without `reminder` it stays as it is.
		expect(parseEvent(eventIcs({ ...input, summary: 'Zahnarzt Dr. B' }, created))?.reminder).toBe(
			30
		);
		expect(parseEvent(eventIcs({ ...input, reminder: 0 }, created))?.reminder).toBe(0);
		expect(parseEvent(eventIcs({ ...input, reminder: null }, created))?.reminder).toBeNull();
	});
});

describe('single occurrences', () => {
	const series = wrap(
		...berlin,
		'BEGIN:VEVENT',
		'UID:s1',
		'DTSTAMP:20261001T000000Z',
		'SEQUENCE:2',
		'DTSTART;TZID=Europe/Berlin:20261102T090000',
		'DTEND;TZID=Europe/Berlin:20261102T100000',
		'RRULE:FREQ=WEEKLY;COUNT=3',
		'SUMMARY:Jour fixe',
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		'TRIGGER:-PT10M',
		'END:VALARM',
		'END:VEVENT'
	);
	const month = [new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 11, 1))] as const;

	it('changes one occurrence in the series time zone, keeping its reminder', () => {
		const [, second] = occurrences(series, ...month);
		expect(second.recurrenceId).toBe('2026-11-09T09:00:00');
		const ics = occurrenceIcs(
			{
				summary: 'Jour fixe (verschoben)',
				start: Date.UTC(2026, 10, 10, 13),
				end: Date.UTC(2026, 10, 10, 14),
				allDay: false
			},
			series,
			second.recurrenceId!
		);
		expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000');
		expect(
			occurrences(ics, ...month).map((o) => [o.start.toISOString(), o.summary, o.recurrenceId])
		).toEqual([
			['2026-11-02T08:00:00.000Z', 'Jour fixe', '2026-11-02T09:00:00'],
			['2026-11-10T13:00:00.000Z', 'Jour fixe (verschoben)', '2026-11-09T09:00:00'],
			['2026-11-16T08:00:00.000Z', 'Jour fixe', '2026-11-16T09:00:00']
		]);
		// The series stays as it was; the moved occurrence reminds 10 minutes before its new time.
		expect(parseEvent(ics)).toMatchObject({ summary: 'Jour fixe', reminder: 10 });
		expect(
			alarmsIn(ics, new Date(Date.UTC(2026, 10, 10, 12)), new Date(Date.UTC(2026, 10, 10, 13))).map(
				(a) => a.at
			)
		).toEqual([new Date(Date.UTC(2026, 10, 10, 12, 50))]);
	});

	it('leaves out one occurrence, and drops its changes', () => {
		const changed = occurrenceIcs(
			{
				summary: 'Anders',
				start: Date.UTC(2026, 10, 9, 12),
				end: Date.UTC(2026, 10, 9, 13),
				allDay: false
			},
			series,
			'2026-11-09T09:00:00'
		);
		const ics = withoutOccurrence(changed, '2026-11-09T09:00:00')!;
		expect(ics).toContain('EXDATE;TZID=Europe/Berlin:20261109T090000');
		expect(ics).not.toContain('Anders');
		expect(occurrences(ics, ...month).map((o) => o.start.toISOString())).toEqual([
			'2026-11-02T08:00:00.000Z',
			'2026-11-16T08:00:00.000Z'
		]);
	});

	it('handles all-day series', () => {
		const daily = wrap(
			'BEGIN:VEVENT',
			'UID:d1',
			'DTSTART;VALUE=DATE:20261102',
			'DTEND;VALUE=DATE:20261103',
			'RRULE:FREQ=DAILY;COUNT=3',
			'SUMMARY:Messe',
			'END:VEVENT'
		);
		const ics = withoutOccurrence(daily, '2026-11-03')!;
		expect(ics).toContain('EXDATE;VALUE=DATE:20261103');
		expect(occurrences(ics, ...month)).toHaveLength(2);
	});
});
