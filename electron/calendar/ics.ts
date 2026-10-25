// Reading and writing iCalendar (RFC 5545) with ical.js: the fields a calendar
// view needs, occurrences of recurring events in a range, and the text to send
// back when an event is created or changed.
import ICAL from 'ical.js';

export interface ParsedEvent {
	uid: string;
	summary: string;
	location: string | null;
	description: string | null;
	start: Date;
	end: Date;
	allDay: boolean;
	recurring: boolean;
	/** Last possible occurrence; null if the series never ends. */
	recurUntil: Date | null;
	/** Minutes before the start of the first reminder; null for none. */
	reminder: number | null;
}

/** A reminder that is due: when, and of which occurrence. */
export interface Alarm {
	at: Date;
	start: Date;
	end: Date;
	summary: string;
	location: string | null;
	allDay: boolean;
}

export interface Occurrence {
	start: Date;
	end: Date;
	summary: string;
	location: string | null;
	/** Set for occurrences of a recurring event. */
	recurrenceId?: string;
}

export interface EventInput {
	summary: string;
	location?: string;
	description?: string;
	/** Milliseconds; for all-day events local midnight, end exclusive. */
	start: number;
	end: number;
	allDay: boolean;
	/** Minutes before the start; null removes reminders, undefined keeps them. */
	reminder?: number | null;
}

const day = 24 * 60 * 60 * 1000;
/** Guards against endless or huge series. */
const maxOccurrences = 5000;

function component(ics: string) {
	const root = new ICAL.Component(ICAL.parse(ics));
	// Time zones defined in the object, so TZID=Europe/Berlin converts correctly.
	for (const zone of root.getAllSubcomponents('vtimezone')) {
		const tz = new ICAL.Timezone(zone);
		if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
	}
	return root;
}

/** The series itself, not one of its changed occurrences. */
function master(root: ICAL.Component) {
	const all = root.getAllSubcomponents('vevent');
	return all.find((v) => !v.hasProperty('recurrence-id')) ?? all[0] ?? null;
}

function endOf(event: ICAL.Event) {
	if (event.endDate) return event.endDate.toJSDate();
	const start = event.startDate.toJSDate();
	return new Date(start.getTime() + (event.startDate.isDate ? day : 0));
}

export function parseEvent(ics: string): ParsedEvent | null {
	let root: ICAL.Component;
	try {
		root = component(ics);
	} catch {
		return null;
	}
	const vevent = master(root);
	if (!vevent || !vevent.hasProperty('dtstart')) return null;
	const event = new ICAL.Event(vevent);
	const start = event.startDate.toJSDate();
	const end = endOf(event);
	const recurring = event.isRecurring();
	return {
		uid: event.uid || '',
		summary: event.summary || '',
		location: event.location || null,
		description: event.description || null,
		start,
		end,
		allDay: event.startDate.isDate,
		recurring,
		recurUntil: recurring ? lastOccurrence(event, end.getTime() - start.getTime()) : null,
		reminder: firstReminder(vevent)
	};
}

type Trigger = { offset: number; related: 'start' | 'end' } | { at: Date };

/** When the event's reminders go off; e-mail alarms are left to the server. */
function triggers(vevent: ICAL.Component): Trigger[] {
	return vevent.getAllSubcomponents('valarm').flatMap((alarm): Trigger[] => {
		const action = String(alarm.getFirstPropertyValue('action') ?? 'DISPLAY').toUpperCase();
		const trigger = alarm.getFirstProperty('trigger');
		if (!trigger || (action !== 'DISPLAY' && action !== 'AUDIO')) return [];
		const value = trigger.getFirstValue();
		if (value instanceof ICAL.Duration) {
			const related = String(trigger.getParameter('related') ?? '').toUpperCase();
			return [{ offset: value.toSeconds() * 1000, related: related === 'END' ? 'end' : 'start' }];
		}
		return value instanceof ICAL.Time ? [{ at: value.toJSDate() }] : [];
	});
}

function firstReminder(vevent: ICAL.Component): number | null {
	for (const trigger of triggers(vevent)) {
		if ('offset' in trigger && trigger.related === 'start' && trigger.offset <= 0) {
			return Math.round(-trigger.offset / 60_000) || 0;
		}
	}
	return null;
}

/** End of the last occurrence, or null for a series without UNTIL or COUNT. */
function lastOccurrence(event: ICAL.Event, duration: number): Date | null {
	const rules = event.component
		.getAllProperties('rrule')
		.map((p) => p.getFirstValue() as ICAL.Recur | null);
	if (rules.some((rule) => !rule?.until && !rule?.count)) return null;
	const iterator = event.iterator();
	let last: ICAL.Time | null = null;
	for (let i = 0, next = iterator.next(); next && i < maxOccurrences; i++, next = iterator.next()) {
		last = next;
	}
	return last ? new Date(last.toJSDate().getTime() + duration) : null;
}

interface Expanded extends Occurrence {
	/** The VEVENT the occurrence comes from: the series or a changed occurrence. */
	vevent: ICAL.Component;
}

function expand(ics: string, from: Date, to: Date): Expanded[] {
	const root = component(ics);
	const vevent = master(root);
	if (!vevent) return [];
	const event = new ICAL.Event(vevent);
	for (const exception of root.getAllSubcomponents('vevent')) {
		if (exception !== vevent && exception.hasProperty('recurrence-id')) {
			event.relateException(exception);
		}
	}
	const overlaps = (start: Date, end: Date) =>
		start < to && (end > from || (end.getTime() === start.getTime() && start >= from));

	if (!event.isRecurring()) {
		const start = event.startDate.toJSDate();
		const end = endOf(event);
		return overlaps(start, end)
			? [{ start, end, summary: event.summary || '', location: event.location || null, vevent }]
			: [];
	}
	const found: Expanded[] = [];
	const iterator = event.iterator();
	for (let i = 0, next = iterator.next(); next && i < maxOccurrences; i++, next = iterator.next()) {
		const details = event.getOccurrenceDetails(next);
		const start = details.startDate.toJSDate();
		if (start >= to) break;
		const end = details.endDate.toJSDate();
		if (!overlaps(start, end)) continue;
		found.push({
			start,
			end,
			summary: details.item.summary || '',
			location: details.item.location || null,
			recurrenceId: details.recurrenceId.toString(),
			vevent: details.item.component
		});
	}
	return found;
}

/** The occurrences that overlap [from, to), with changed ones as changed. */
export function occurrences(ics: string, from: Date, to: Date): Occurrence[] {
	return expand(ics, from, to).map(({ vevent: _, ...occurrence }) => occurrence);
}

/** How far before (or after) its event a reminder is looked for. */
export const alarmReach = 8 * day;

/** The reminders that go off in (from, to]. */
export function alarmsIn(ics: string, from: Date, to: Date): Alarm[] {
	const found: Alarm[] = [];
	const window = expand(
		ics,
		new Date(from.getTime() - alarmReach),
		new Date(to.getTime() + alarmReach)
	);
	for (const occurrence of window) {
		const dtstart = occurrence.vevent.getFirstPropertyValue('dtstart');
		const allDay = dtstart instanceof ICAL.Time && dtstart.isDate;
		for (const trigger of triggers(occurrence.vevent)) {
			const at =
				'at' in trigger
					? trigger.at
					: new Date(
							(trigger.related === 'end' ? occurrence.end : occurrence.start).getTime() +
								trigger.offset
						);
			if (at > from && at <= to) {
				found.push({
					at,
					start: occurrence.start,
					end: occurrence.end,
					summary: occurrence.summary,
					location: occurrence.location,
					allDay
				});
			}
		}
	}
	return found;
}

function time(ms: number, allDay: boolean) {
	if (!allDay) return ICAL.Time.fromJSDate(new Date(ms), true);
	const date = new Date(ms);
	return ICAL.Time.fromDateString(
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
	);
}

/**
 * The iCalendar text for a new event, or `previous` with the given fields
 * changed (everything else, recurrence and alarms included, stays).
 */
export function eventIcs(
	input: EventInput,
	previous?: string,
	uid: string = crypto.randomUUID()
): string {
	let root: ICAL.Component;
	let vevent: ICAL.Component;
	if (previous) {
		root = component(previous);
		vevent = master(root) ?? new ICAL.Component('vevent');
	} else {
		root = new ICAL.Component(['vcalendar', [], []]);
		root.addPropertyWithValue('version', '2.0');
		root.addPropertyWithValue('prodid', '-//Velo Mail//DE');
		vevent = new ICAL.Component('vevent');
		vevent.addPropertyWithValue('uid', uid);
		root.addSubcomponent(vevent);
	}
	const event = new ICAL.Event(vevent);
	event.summary = input.summary;
	set(vevent, 'location', input.location);
	set(vevent, 'description', input.description);
	vevent.removeProperty('duration');
	event.startDate = time(input.start, input.allDay);
	event.endDate = time(input.end, input.allDay);
	if (input.reminder !== undefined) setReminder(vevent, input.reminder, input.summary);
	vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
	const sequence = Number(vevent.getFirstPropertyValue('sequence') ?? -1);
	vevent.updatePropertyWithValue('sequence', previous ? sequence + 1 : 0);
	return root.toString().replace(/\r?\n/g, '\r\n') + '\r\n';
}

function set(vevent: ICAL.Component, name: string, value: string | undefined) {
	if (value?.trim()) vevent.updatePropertyWithValue(name, value);
	else vevent.removeProperty(name);
}

/** Replaces the event's reminders with one, `minutes` before the start (or none). */
function setReminder(vevent: ICAL.Component, minutes: number | null, summary: string) {
	for (const alarm of vevent.getAllSubcomponents('valarm')) vevent.removeSubcomponent(alarm);
	if (minutes === null) return;
	const alarm = new ICAL.Component('valarm');
	alarm.addPropertyWithValue('action', 'DISPLAY');
	alarm.addPropertyWithValue('description', summary || 'Erinnerung');
	alarm.addPropertyWithValue('trigger', ICAL.Duration.fromSeconds(-minutes * 60));
	vevent.addSubcomponent(alarm);
}
