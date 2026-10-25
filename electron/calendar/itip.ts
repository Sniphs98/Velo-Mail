// Invitations by mail (iTIP, RFC 5546; iMIP, RFC 6047): reading a REQUEST or
// CANCEL, the REPLY that answers it, and the copy that goes into the calendar
// with the own answer in it.
import ICAL from 'ical.js';
import type { Invitation, InvitationResponse, ParticipantStatus } from '../../src/lib/api';
import { parseEvent } from './ics';

/** What parseInvitation gets out of the iCalendar text; the rest comes from the calendar. */
export type ParsedInvitation = Omit<
	Invitation,
	'response' | 'calendarId' | 'inCalendar' | 'outdated'
> & {
	uid: string;
	sequence: number;
	/** Set if the invitation is about one occurrence of a series. */
	recurrenceId: string | null;
};

const statuses: Record<string, ParticipantStatus> = {
	ACCEPTED: 'accepted',
	TENTATIVE: 'tentative',
	DECLINED: 'declined',
	DELEGATED: 'delegated'
};

const partstat: Record<InvitationResponse, string> = {
	accepted: 'ACCEPTED',
	tentative: 'TENTATIVE',
	declined: 'DECLINED'
};

function parse(ics: string): ICAL.Component | null {
	try {
		const root = new ICAL.Component(ICAL.parse(ics));
		for (const zone of root.getAllSubcomponents('vtimezone')) {
			const tz = new ICAL.Timezone(zone);
			if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
		}
		return root.name === 'vcalendar' ? root : null;
	} catch {
		return null;
	}
}

/** "mailto:Anna@Firma.de" → "anna@firma.de". */
function addressOf(value: unknown): string {
	return String(value ?? '')
		.replace(/^mailto:/i, '')
		.trim()
		.toLowerCase();
}

function person(property: ICAL.Property) {
	const name = property.getParameter('cn');
	const address = addressOf(property.getFirstValue());
	return typeof name === 'string' && name.trim() ? { name: name.trim(), address } : { address };
}

function sequence(vevent: ICAL.Component) {
	return Number(vevent.getFirstPropertyValue('sequence') ?? 0) || 0;
}

/** The series (or the single event), else the first occurrence given. */
function main(root: ICAL.Component) {
	const all = root.getAllSubcomponents('vevent');
	return all.find((v) => !v.hasProperty('recurrence-id')) ?? all[0] ?? null;
}

export function parseInvitation(ics: string): ParsedInvitation | null {
	const root = parse(ics);
	const vevent = root && main(root);
	if (!root || !vevent) return null;
	const event = parseEvent(ics);
	if (!event) return null;
	const method = String(root.getFirstPropertyValue('method') ?? '').toUpperCase();
	const organizer = vevent.getFirstProperty('organizer');
	const recurrenceId = vevent.getFirstPropertyValue('recurrence-id');
	return {
		method:
			method === 'REQUEST'
				? 'request'
				: method === 'CANCEL'
					? 'cancel'
					: method === 'REPLY'
						? 'reply'
						: 'other',
		uid: event.uid,
		sequence: sequence(vevent),
		recurrenceId: recurrenceId ? recurrenceId.toString() : null,
		summary: event.summary,
		location: event.location,
		description: event.description,
		start: event.start.getTime(),
		end: event.end.getTime(),
		allDay: event.allDay,
		recurring: event.recurring,
		organizer: organizer ? person(organizer) : null,
		attendees: vevent.getAllProperties('attendee').map((property) => ({
			...person(property),
			status:
				statuses[String(property.getParameter('partstat') ?? '').toUpperCase()] ?? 'needs-action'
		}))
	};
}

/** The own answer in an event (or invitation), if it has one. */
export function responseOf(ics: string, address: string): InvitationResponse | null {
	const root = parse(ics);
	const vevent = root && main(root);
	const me = address.toLowerCase();
	const attendee = vevent
		?.getAllProperties('attendee')
		.find((property) => addressOf(property.getFirstValue()) === me);
	const status = statuses[String(attendee?.getParameter('partstat') ?? '').toUpperCase()];
	return status === 'accepted' || status === 'tentative' || status === 'declined' ? status : null;
}

/** SEQUENCE of the series (or the single event); higher means newer. */
export function sequenceOf(ics: string): number {
	const root = parse(ics);
	const vevent = root && main(root);
	return vevent ? sequence(vevent) : 0;
}

/** Sets the own PARTSTAT, adding the attendee if the invitation went to a list. */
function answer(
	vevent: ICAL.Component,
	address: string,
	name: string,
	response: InvitationResponse
) {
	const me = address.toLowerCase();
	let attendee = vevent
		.getAllProperties('attendee')
		.find((property) => addressOf(property.getFirstValue()) === me);
	if (!attendee) {
		attendee = vevent.addPropertyWithValue('attendee', `mailto:${address}`);
		if (name) attendee.setParameter('cn', name);
	}
	attendee.setParameter('partstat', partstat[response]);
	attendee.removeParameter('rsvp');
	return attendee;
}

function calendarRoot() {
	const root = new ICAL.Component(['vcalendar', [], []]);
	root.addPropertyWithValue('version', '2.0');
	root.addPropertyWithValue('prodid', '-//Velo Mail//DE');
	return root;
}

function copyZones(from: ICAL.Component, to: ICAL.Component) {
	const known = new Set(
		to.getAllSubcomponents('vtimezone').map((z) => z.getFirstPropertyValue('tzid'))
	);
	for (const zone of from.getAllSubcomponents('vtimezone')) {
		if (!known.has(zone.getFirstPropertyValue('tzid'))) {
			to.addSubcomponent(new ICAL.Component(structuredClone(zone.toJSON())));
		}
	}
}

function text(root: ICAL.Component) {
	return root.toString().replace(/\r?\n/g, '\r\n') + '\r\n';
}

const keyOf = (vevent: ICAL.Component) =>
	vevent.getFirstPropertyValue('recurrence-id')?.toString() ?? '';

/**
 * The answer to send to the organizer: METHOD:REPLY with only the own
 * attendee, for each event the invitation was about.
 */
export function replyIcs(
	invitation: string,
	address: string,
	name: string,
	response: InvitationResponse
): string {
	const source = parse(invitation);
	if (!source) throw new Error('Die Einladung lässt sich nicht lesen.');
	const root = calendarRoot();
	root.addPropertyWithValue('method', 'REPLY');
	copyZones(source, root);
	for (const original of source.getAllSubcomponents('vevent')) {
		const vevent = new ICAL.Component(structuredClone(original.toJSON()));
		for (const alarm of vevent.getAllSubcomponents('valarm')) vevent.removeSubcomponent(alarm);
		const mine = answer(vevent, address, name, response);
		for (const attendee of vevent.getAllProperties('attendee')) {
			if (attendee !== mine) vevent.removeProperty(attendee);
		}
		vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
		root.addSubcomponent(vevent);
	}
	return text(root);
}

/**
 * What goes into the calendar: the invitation's events with the own answer,
 * merged into the stored copy (an update for one occurrence replaces only
 * that occurrence). Without METHOD, which a CalDAV server does not accept.
 */
export function calendarIcs(
	invitation: string,
	stored: string | null,
	address: string,
	name: string,
	response: InvitationResponse
): string {
	const source = parse(invitation);
	if (!source) throw new Error('Die Einladung lässt sich nicht lesen.');
	const incoming = source.getAllSubcomponents('vevent');
	const base = stored ? parse(stored) : null;
	// A new version of the whole series replaces everything stored.
	const replacesAll = !base || incoming.some((v) => !v.hasProperty('recurrence-id'));
	const root = replacesAll ? calendarRoot() : base;
	if (base && replacesAll) copyZones(base, root);
	copyZones(source, root);
	const keys = new Set(incoming.map(keyOf));
	for (const old of root.getAllSubcomponents('vevent')) {
		if (keys.has(keyOf(old))) root.removeSubcomponent(old);
	}
	for (const original of incoming) {
		const vevent = new ICAL.Component(structuredClone(original.toJSON()));
		answer(vevent, address, name, response);
		// The answer goes out by mail from here; a scheduling server such as
		// iCloud would otherwise send one of its own (RFC 6638, 7.1).
		vevent.getFirstProperty('organizer')?.setParameter('schedule-agent', 'CLIENT');
		root.addSubcomponent(vevent);
	}
	root.removeAllProperties('method');
	return text(root);
}

/**
 * The stored event without the occurrence a CANCEL names, or null if the
 * whole event is cancelled (then it is deleted).
 */
export function withoutCancelled(stored: string, cancel: string): string | null {
	const root = parse(stored);
	const source = parse(cancel);
	const cancelled = source?.getAllSubcomponents('vevent') ?? [];
	if (!root || cancelled.length === 0 || cancelled.some((v) => !v.hasProperty('recurrence-id'))) {
		return null;
	}
	const series = root.getAllSubcomponents('vevent').find((v) => !v.hasProperty('recurrence-id'));
	if (!series) return null;
	for (const vevent of cancelled) {
		const key = keyOf(vevent);
		for (const old of root.getAllSubcomponents('vevent')) {
			if (old !== series && keyOf(old) === key) root.removeSubcomponent(old);
		}
		const exdate = series.addPropertyWithValue(
			'exdate',
			vevent.getFirstPropertyValue('recurrence-id')
		);
		const tzid = vevent.getFirstProperty('recurrence-id')?.getParameter('tzid');
		if (tzid) exdate.setParameter('tzid', tzid);
	}
	return text(root);
}
