// Keeps the calendars of every source in sync (on start, every few minutes and
// after each change) and writes changes back to the server, guarded by ETags
// so an event changed elsewhere in the meantime is not overwritten.
import { and, asc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { DAVCalendar, DAVClient } from 'tsdav';
import { z } from 'zod';
import type { Calendar, CalendarEvent, EventInput } from '../../src/lib/api';
import type { Database } from '../db';
import { calendars, events } from '../db/schema';
import { eventIcs, occurrences, parseEvent } from './ics';
import type { CalendarSources, Connect } from './service';
import { connect } from './service';

export interface CalendarManagerDeps {
	db: Database;
	sources: CalendarSources;
	onChanged(): void;
	connect?: Connect;
	intervalMinutes?: number;
}

/** Calendar colors, in turn, when the server has none. */
export const calendarColors = ['#ea580c', '#16a34a', '#9333ea', '#db2777', '#0d9488', '#ca8a04'];

function nameOf(calendar: DAVCalendar) {
	return typeof calendar.displayName === 'string' && calendar.displayName.trim()
		? calendar.displayName.trim()
		: 'Kalender';
}

/** "#RRGGBBAA" (Apple) or "#RRGGBB"; anything else is not used. */
function colorOf(calendar: DAVCalendar) {
	const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(calendar.calendarColor?.trim() ?? '');
	return match ? `#${match[1].toLowerCase()}` : null;
}

async function check(response: Response, what: string) {
	if (!response.ok) {
		throw new Error(
			response.status === 412
				? 'Der Termin wurde inzwischen woanders geändert. Bitte noch einmal versuchen.'
				: `${what} fehlgeschlagen (${response.status}).`
		);
	}
}

export class CalendarManager {
	private clients = new Map<number, Promise<DAVClient>>();
	private timer?: ReturnType<typeof setInterval>;
	private running?: Promise<void>;

	constructor(private readonly deps: CalendarManagerDeps) {}

	start() {
		this.syncAll().catch(() => {});
		const minutes = this.deps.intervalMinutes ?? 5;
		this.timer = setInterval(() => this.syncAll().catch(() => {}), minutes * 60_000);
	}

	stop() {
		clearInterval(this.timer);
	}

	forget(sourceId: number) {
		this.clients.delete(sourceId);
	}

	private client(sourceId: number) {
		let client = this.clients.get(sourceId);
		if (!client) {
			client = (async () => {
				const login = await this.deps.sources.credentials(sourceId);
				if (!login) throw new Error('Den Kalender gibt es nicht mehr.');
				return (this.deps.connect ?? connect)(login);
			})();
			// A failed login is tried again next time.
			client.catch(() => this.clients.delete(sourceId));
			this.clients.set(sourceId, client);
		}
		return client;
	}

	/** One round at a time; a second call waits for the running one. */
	syncAll() {
		this.running ??= (async () => {
			for (const source of await this.deps.sources.list()) {
				await this.syncSource(source.id).catch(() => {});
			}
		})().finally(() => (this.running = undefined));
		return this.running;
	}

	async syncSource(sourceId: number) {
		const client = await this.client(sourceId);
		const remote = (await client.fetchCalendars()).filter(
			(c) => !c.components || c.components.includes('VEVENT')
		);
		const stored = await this.deps.db
			.select()
			.from(calendars)
			.where(eq(calendars.sourceId, sourceId));
		let changed = false;

		const gone = stored.filter((c) => !remote.some((r) => r.url === c.url)).map((c) => c.id);
		if (gone.length > 0) {
			await this.deps.db.delete(calendars).where(inArray(calendars.id, gone));
			changed = true;
		}
		for (const [i, calendar] of remote.entries()) {
			let row = stored.find((c) => c.url === calendar.url);
			if (!row) {
				const color =
					colorOf(calendar) ?? calendarColors[(stored.length + i) % calendarColors.length];
				[row] = await this.deps.db
					.insert(calendars)
					.values({ sourceId, url: calendar.url, name: nameOf(calendar), color })
					.returning();
				changed = true;
			} else if (row.name !== nameOf(calendar)) {
				await this.deps.db
					.update(calendars)
					.set({ name: nameOf(calendar) })
					.where(eq(calendars.id, row.id));
				changed = true;
			}
			// Unchanged since the last round: nothing to fetch.
			if (calendar.ctag && calendar.ctag === row.ctag) continue;
			await this.syncCalendar(client, calendar, row.id);
			await this.deps.db
				.update(calendars)
				.set({ ctag: calendar.ctag ?? null })
				.where(eq(calendars.id, row.id));
			changed = true;
		}
		if (changed) this.deps.onChanged();
	}

	/** Fetches the calendar's events and stores what is new or changed. */
	private async syncCalendar(client: DAVClient, calendar: DAVCalendar, calendarId: number) {
		const objects = await client.fetchCalendarObjects({ calendar });
		const stored = await this.deps.db
			.select({ id: events.id, href: events.href, etag: events.etag })
			.from(events)
			.where(eq(events.calendarId, calendarId));
		const byHref = new Map(stored.map((e) => [e.href, e]));
		const seen = new Set<string>();
		for (const object of objects) {
			seen.add(object.url);
			const known = byHref.get(object.url);
			if (known && object.etag && known.etag === object.etag) continue;
			const ics = typeof object.data === 'string' ? object.data : '';
			const parsed = parseEvent(ics);
			if (!parsed) continue;
			const values = {
				calendarId,
				href: object.url,
				etag: object.etag ?? null,
				uid: parsed.uid,
				ics,
				summary: parsed.summary,
				location: parsed.location,
				start: parsed.start,
				end: parsed.end,
				allDay: parsed.allDay,
				recurring: parsed.recurring,
				recurUntil: parsed.recurUntil
			};
			await this.deps.db
				.insert(events)
				.values(values)
				.onConflictDoUpdate({ target: [events.calendarId, events.href], set: values });
		}
		const removed = stored.filter((e) => !seen.has(e.href)).map((e) => e.id);
		if (removed.length > 0) await this.deps.db.delete(events).where(inArray(events.id, removed));
	}

	calendars(): Promise<Calendar[]> {
		return this.deps.db
			.select({
				id: calendars.id,
				sourceId: calendars.sourceId,
				name: calendars.name,
				color: calendars.color,
				enabled: calendars.enabled
			})
			.from(calendars)
			.orderBy(asc(calendars.sourceId), asc(calendars.name));
	}

	/** Shows or hides a calendar, or gives it another color (only here, not on the server). */
	async updateCalendar(id: number, changes: unknown) {
		const valid = z
			.object({ enabled: z.boolean(), color: z.string().regex(/^#[0-9a-f]{6}$/i) })
			.partial()
			.strict()
			.parse(changes);
		await this.deps.db.update(calendars).set(valid).where(eq(calendars.id, id));
		this.deps.onChanged();
	}

	/** Occurrences in [from, to) of the calendars that are shown. */
	async events(from: number, to: number): Promise<CalendarEvent[]> {
		const start = new Date(from);
		const end = new Date(to);
		const rows = await this.deps.db
			.select({ event: events, color: calendars.color })
			.from(events)
			.innerJoin(calendars, eq(calendars.id, events.calendarId))
			.where(
				and(
					eq(calendars.enabled, true),
					lt(events.start, end),
					or(
						and(eq(events.recurring, false), gt(events.end, start)),
						// An event as long as it is short (start = end) still shows.
						and(eq(events.recurring, false), eq(events.end, events.start), gt(events.start, start)),
						and(
							eq(events.recurring, true),
							or(isNull(events.recurUntil), gt(events.recurUntil, start))
						)
					)
				)
			);
		const found: CalendarEvent[] = [];
		for (const { event, color } of rows) {
			const description = parseEvent(event.ics)?.description ?? null;
			for (const occurrence of occurrences(event.ics, start, end)) {
				found.push({
					id: event.id,
					calendarId: event.calendarId,
					color,
					summary: occurrence.summary,
					location: occurrence.location,
					description,
					start: occurrence.start.getTime(),
					end: occurrence.end.getTime(),
					allDay: event.allDay,
					recurring: event.recurring
				});
			}
		}
		return found.sort((a, b) => a.start - b.start || a.end - b.end);
	}

	private async calendar(calendarId: number) {
		const [row] = await this.deps.db.select().from(calendars).where(eq(calendars.id, calendarId));
		if (!row) throw new Error('Den Kalender gibt es nicht mehr.');
		return row;
	}

	async create(calendarId: number, input: EventInput) {
		const calendar = await this.calendar(calendarId);
		const client = await this.client(calendar.sourceId);
		const uid = crypto.randomUUID();
		const response = await client.createCalendarObject({
			calendar: { url: calendar.url },
			filename: `${uid}.ics`,
			iCalString: eventIcs(input, undefined, uid)
		});
		await check(response, 'Speichern');
		await this.refresh(calendar.sourceId, calendarId);
	}

	async update(eventId: number, input: EventInput, occurrenceStart?: number) {
		const { event, calendar } = await this.event(eventId);
		let change = input;
		// A recurring event moves as a whole, by as much as the occurrence was moved.
		if (event.recurring && occurrenceStart !== undefined) {
			const shift = input.start - occurrenceStart;
			const duration = input.end - input.start;
			const start = event.start.getTime() + shift;
			change = { ...input, start, end: start + duration };
		}
		const client = await this.client(calendar.sourceId);
		const response = await client.updateCalendarObject({
			calendarObject: {
				url: event.href,
				etag: event.etag ?? undefined,
				data: eventIcs(change, event.ics)
			}
		});
		await check(response, 'Speichern');
		await this.refresh(calendar.sourceId, calendar.id);
	}

	async delete(eventId: number) {
		const { event, calendar } = await this.event(eventId);
		const client = await this.client(calendar.sourceId);
		const response = await client.deleteCalendarObject({
			calendarObject: { url: event.href, etag: event.etag ?? undefined }
		});
		await check(response, 'Löschen');
		await this.deps.db.delete(events).where(eq(events.id, eventId));
		await this.refresh(calendar.sourceId, calendar.id);
	}

	private async event(eventId: number) {
		const [row] = await this.deps.db
			.select({ event: events, calendar: calendars })
			.from(events)
			.innerJoin(calendars, eq(calendars.id, events.calendarId))
			.where(eq(events.id, eventId));
		if (!row) throw new Error('Den Termin gibt es nicht mehr.');
		return row;
	}

	/** Fetches one calendar again after a change, so the stored ETag is current. */
	private async refresh(sourceId: number, calendarId: number) {
		const calendar = await this.calendar(calendarId);
		const client = await this.client(sourceId);
		await this.syncCalendar(client, { url: calendar.url }, calendarId);
		this.deps.onChanged();
	}
}
