import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db';
import { calendars, calendarSources, events } from '../db/schema';
import { eventIcs, parseEvent } from './ics';
import { Reminders, type Reminder } from './reminders';

const utc = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour, minute);

async function setup() {
	const db = openDatabase(':memory:', path.resolve('drizzle'));
	const [source] = await db
		.insert(calendarSources)
		.values({
			name: 'anna',
			serverUrl: 'https://dav.test',
			username: 'anna',
			secret: Buffer.from('x')
		})
		.returning();
	const [shown, hidden] = await db
		.insert(calendars)
		.values([
			{ sourceId: source.id, url: '/privat/', name: 'Privat', color: '#ea580c' },
			{ sourceId: source.id, url: '/arbeit/', name: 'Arbeit', color: '#16a34a', enabled: false }
		])
		.returning();
	const add = async (
		calendarId: number,
		summary: string,
		start: number,
		reminder: number | null
	) => {
		const ics = eventIcs({ summary, start, end: start + 3600_000, allDay: false, reminder });
		const parsed = parseEvent(ics)!;
		await db.insert(events).values({
			calendarId,
			href: `/${summary}.ics`,
			uid: parsed.uid,
			ics,
			summary,
			start: parsed.start,
			end: parsed.end
		});
	};
	return { db, shown, hidden, add };
}

describe('Reminders', () => {
	it('shows each reminder once, when it is due, only for shown calendars', async () => {
		const { db, shown, hidden, add } = await setup();
		await add(shown.id, 'Retro', utc(3, 15), 15);
		await add(shown.id, 'Ohne Erinnerung', utc(3, 15), null);
		await add(hidden.id, 'Ausgeblendet', utc(3, 15), 15);
		let now = utc(3, 14, 40);
		const notify = vi.fn<(reminder: Reminder) => void>();
		const reminders = new Reminders({ db, notify, enabled: async () => true, now: () => now });

		await reminders.check();
		expect(notify).not.toHaveBeenCalled();

		now = utc(3, 14, 45);
		await reminders.check();
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify.mock.calls[0][0]).toMatchObject({
			summary: 'Retro',
			at: new Date(utc(3, 14, 45)),
			start: new Date(utc(3, 15))
		});

		now = utc(3, 14, 46);
		await reminders.check();
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('shows a reminder of the last minutes that came with a later sync', async () => {
		const { db, shown, add } = await setup();
		let now = utc(3, 14, 50);
		const notify = vi.fn();
		const reminders = new Reminders({ db, notify, enabled: async () => true, now: () => now });
		await reminders.check();
		// The event arrives after the first look; its reminder went off at 14:45.
		await add(shown.id, 'Nachgereicht', utc(3, 15), 15);
		now = utc(3, 14, 51);
		await reminders.check();
		expect(notify).toHaveBeenCalledTimes(1);
		// Much later nothing old comes back.
		now = utc(3, 16);
		await reminders.check();
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('catches up on reminders of the last minutes after a start', async () => {
		const { db, shown, add } = await setup();
		await add(shown.id, 'Kurz vorher', utc(3, 15), 15);
		const notify = vi.fn();
		// Started at 14:50: the reminder at 14:45 is still shown.
		const reminders = new Reminders({
			db,
			notify,
			enabled: async () => true,
			now: () => utc(3, 14, 50)
		});
		await reminders.check();
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('stays quiet when reminders are switched off', async () => {
		const { db, shown, add } = await setup();
		await add(shown.id, 'Retro', utc(3, 15), 0);
		const notify = vi.fn();
		const reminders = new Reminders({
			db,
			notify,
			enabled: async () => false,
			now: () => utc(3, 15)
		});
		await reminders.check();
		expect(notify).not.toHaveBeenCalled();
	});
});
