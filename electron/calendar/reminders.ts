// Reminders of calendar events (VALARM) as desktop notifications. Every half
// minute, and after each calendar sync, the alarms of the last few minutes
// are shown, each once: so a reminder is not lost to a restart or to an event
// that arrives with the next sync.
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../db';
import { calendars, events } from '../db/schema';
import { alarmReach, alarmsIn, type Alarm } from './ics';

export interface Reminder extends Alarm {
	eventId: number;
}

export interface RemindersDeps {
	db: Database;
	notify(reminder: Reminder): void;
	/** Whether reminders are switched on in the settings. */
	enabled(): Promise<boolean>;
	now?(): number;
}

/** How far back each look goes. */
const lookBack = 10 * 60_000;

export class Reminders {
	private timer?: ReturnType<typeof setInterval>;
	/** Shown already (key → when it went off), so each reminder comes once. */
	private shown = new Map<string, number>();

	constructor(private readonly deps: RemindersDeps) {}

	private now() {
		return this.deps.now?.() ?? Date.now();
	}

	start() {
		this.check().catch(() => {});
		this.timer = setInterval(() => this.check().catch(() => {}), 30_000);
	}

	stop() {
		clearInterval(this.timer);
	}

	/** Shows the reminders of the last minutes that were not shown yet. */
	async check() {
		const to = this.now();
		const from = to - lookBack;
		for (const [key, at] of this.shown) if (at <= from) this.shown.delete(key);
		if (!(await this.deps.enabled())) return;
		// Events that can have an alarm in the window: those near it.
		const near = new Date(from - alarmReach);
		const rows = await this.deps.db
			.select({ id: events.id, ics: events.ics })
			.from(events)
			.innerJoin(calendars, eq(calendars.id, events.calendarId))
			.where(
				and(
					eq(calendars.enabled, true),
					lt(events.start, new Date(to + alarmReach)),
					or(
						and(eq(events.recurring, false), gt(events.end, near)),
						and(
							eq(events.recurring, true),
							or(isNull(events.recurUntil), gt(events.recurUntil, near))
						)
					)
				)
			);
		for (const row of rows) {
			for (const alarm of alarmsIn(row.ics, new Date(from), new Date(to))) {
				const key = `${row.id}:${alarm.start.getTime()}:${alarm.at.getTime()}`;
				if (this.shown.has(key)) continue;
				this.shown.set(key, alarm.at.getTime());
				this.deps.notify({ ...alarm, eventId: row.id });
			}
		}
	}
}
