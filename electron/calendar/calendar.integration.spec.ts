import path from 'node:path';
import { DAVClient } from 'tsdav';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { radicale } from '../../scripts/radicale.mjs';
import type { SecretBox } from '../accounts/service';
import { openDatabase, type Database } from '../db';
import { CalendarManager } from './manager';
import { CalendarSources } from './service';

const secrets: SecretBox = {
	encrypt: async (plain) => Buffer.from(plain).reverse(),
	decrypt: async (encrypted) => Buffer.from(encrypted).reverse().toString()
};

const ics = (uid: string, start: string, end: string, summary: string, extra: string[] = []) =>
	[
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Test//DE',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		'DTSTAMP:20261001T000000Z',
		`DTSTART:${start}`,
		`DTEND:${end}`,
		`SUMMARY:${summary}`,
		...extra,
		'END:VEVENT',
		'END:VCALENDAR',
		''
	].join('\r\n');

/** The server as another app sees it. */
async function direct() {
	const client = new DAVClient({
		serverUrl: radicale.url,
		credentials: radicale.user,
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
	await client.login();
	return client;
}

let db: Database;
let sources: CalendarSources;
let manager: CalendarManager;
let onChanged: ReturnType<typeof vi.fn<() => void>>;
let name: string;

beforeEach(async () => {
	db = openDatabase(':memory:', path.resolve('drizzle'));
	sources = new CalendarSources(db, secrets);
	onChanged = vi.fn<() => void>();
	manager = new CalendarManager({ db, sources, onChanged });
	// Each test gets a calendar of its own on the shared server.
	name = `Kalender ${crypto.randomUUID().slice(0, 8)}`;
	const client = await direct();
	await client.makeCalendar({
		url: `${client.account!.homeUrl}${encodeURIComponent(name)}/`,
		props: { displayname: name }
	});
});

async function addSource() {
	const result = await sources.add({ ...radicale.user, serverUrl: radicale.url });
	if (!result.ok) throw new Error(result.reason);
	return result.source;
}

async function mine() {
	const client = await direct();
	const calendar = (await client.fetchCalendars()).find((c) => c.displayName === name)!;
	return { client, calendar };
}

describe('calendar sources', () => {
	it('adds a source after logging in, and says why it could not', async () => {
		const source = await addSource();
		expect(source).toMatchObject({ name: 'anna', username: 'anna' });
		expect(
			await sources.add({ username: 'anna', password: 'falsch', serverUrl: radicale.url })
		).toEqual({ ok: false, reason: 'auth' });
		expect(
			await sources.add({ username: 'anna', password: 'geheim', serverUrl: 'http://127.0.0.1:1' })
		).toEqual({ ok: false, reason: 'notfound' });
		expect(await sources.add({ username: 'du@gmail.com', password: 'x' })).toEqual({
			ok: false,
			reason: 'oauth'
		});
	});
});

describe('CalendarManager against Radicale', () => {
	it('syncs calendars and events, recurring ones expanded', async () => {
		const { client, calendar } = await mine();
		await client.createCalendarObject({
			calendar,
			filename: 'termin.ics',
			iCalString: ics('termin', '20261027T090000Z', '20261027T100000Z', 'Zahnarzt', [
				'LOCATION:Hauptstraße 1'
			])
		});
		await client.createCalendarObject({
			calendar,
			filename: 'serie.ics',
			iCalString: ics('serie', '20261026T080000Z', '20261026T083000Z', 'Stand-up', [
				'RRULE:FREQ=DAILY;COUNT=5'
			])
		});
		const source = await addSource();

		await manager.syncSource(source.id);
		expect(onChanged).toHaveBeenCalled();
		const found = await manager.events(Date.UTC(2026, 9, 26), Date.UTC(2026, 9, 29));
		expect(found.map((e) => [new Date(e.start).toISOString(), e.summary])).toEqual([
			['2026-10-26T08:00:00.000Z', 'Stand-up'],
			['2026-10-27T08:00:00.000Z', 'Stand-up'],
			['2026-10-27T09:00:00.000Z', 'Zahnarzt'],
			['2026-10-28T08:00:00.000Z', 'Stand-up']
		]);
		expect(found.find((e) => e.summary === 'Zahnarzt')).toMatchObject({
			location: 'Hauptstraße 1',
			recurring: false
		});

		// Unchanged on the server: the next round fetches nothing.
		onChanged.mockClear();
		await manager.syncSource(source.id);
		expect(onChanged).not.toHaveBeenCalled();
	});

	it('creates, changes and deletes events on the server', async () => {
		const source = await addSource();
		await manager.syncSource(source.id);
		const calendar = (await manager.calendars()).find((c) => c.name === name)!;
		const week = [Date.UTC(2026, 10, 2), Date.UTC(2026, 10, 9)] as const;

		await manager.create(calendar.id, {
			summary: 'Neuer Termin',
			location: 'Büro',
			start: Date.UTC(2026, 10, 3, 14),
			end: Date.UTC(2026, 10, 3, 15),
			allDay: false
		});
		let [event] = await manager.events(...week);
		expect(event).toMatchObject({
			summary: 'Neuer Termin',
			location: 'Büro',
			calendarId: calendar.id
		});
		const remote = async () => {
			const { client, calendar: found } = await mine();
			return client.fetchCalendarObjects({ calendar: found });
		};
		expect((await remote())[0].data).toContain('SUMMARY:Neuer Termin');

		await manager.update(event.id, {
			summary: 'Verschoben',
			start: Date.UTC(2026, 10, 4, 9),
			end: Date.UTC(2026, 10, 4, 10),
			allDay: false
		});
		[event] = await manager.events(...week);
		expect(event).toMatchObject({
			summary: 'Verschoben',
			location: null,
			start: Date.UTC(2026, 10, 4, 9)
		});
		expect((await remote())[0].data).toContain('SUMMARY:Verschoben');

		await manager.delete(event.id);
		expect(await manager.events(...week)).toEqual([]);
		expect(await remote()).toEqual([]);
	});

	it('moves a whole series by as much as one occurrence was moved', async () => {
		const { client, calendar } = await mine();
		await client.createCalendarObject({
			calendar,
			filename: 'jf.ics',
			iCalString: ics('jf', '20261102T090000Z', '20261102T100000Z', 'Jour fixe', [
				'RRULE:FREQ=WEEKLY'
			])
		});
		const source = await addSource();
		await manager.syncSource(source.id);
		const range = [Date.UTC(2026, 10, 9), Date.UTC(2026, 10, 10)] as const;
		const [second] = await manager.events(...range);

		// The occurrence on the 9th moved an hour later: so does the whole series.
		await manager.update(
			second.id,
			{
				summary: 'Jour fixe',
				start: second.start + 3600_000,
				end: second.end + 3600_000,
				allDay: false
			},
			second.start
		);
		const moved = await manager.events(Date.UTC(2026, 10, 2), Date.UTC(2026, 10, 17));
		expect(moved.map((e) => new Date(e.start).toISOString())).toEqual([
			'2026-11-02T10:00:00.000Z',
			'2026-11-09T10:00:00.000Z',
			'2026-11-16T10:00:00.000Z'
		]);
	});

	it('picks up changes made elsewhere and refuses to overwrite them', async () => {
		const { client, calendar } = await mine();
		await client.createCalendarObject({
			calendar,
			filename: 'x.ics',
			iCalString: ics('x', '20261105T090000Z', '20261105T100000Z', 'Original')
		});
		const source = await addSource();
		await manager.syncSource(source.id);
		const [event] = await manager.events(Date.UTC(2026, 10, 5), Date.UTC(2026, 10, 6));

		// Another app changes it.
		const [object] = await client.fetchCalendarObjects({ calendar });
		await client.updateCalendarObject({
			calendarObject: {
				...object,
				data: object.data.replace('SUMMARY:Original', 'SUMMARY:Von woanders')
			}
		});

		await expect(
			manager.update(event.id, {
				summary: 'Von hier',
				start: event.start,
				end: event.end,
				allDay: false
			})
		).rejects.toThrow('woanders geändert');

		await manager.syncSource(source.id);
		expect((await manager.events(Date.UTC(2026, 10, 5), Date.UTC(2026, 10, 6)))[0].summary).toBe(
			'Von woanders'
		);
	});

	it('hides calendars and changes their color', async () => {
		const { client, calendar } = await mine();
		await client.createCalendarObject({
			calendar,
			filename: 'y.ics',
			iCalString: ics('y', '20261106T090000Z', '20261106T100000Z', 'Sichtbar?')
		});
		const source = await addSource();
		await manager.syncSource(source.id);
		const mineRow = (await manager.calendars()).find((c) => c.name === name)!;
		const range = [Date.UTC(2026, 10, 6), Date.UTC(2026, 10, 7)] as const;

		await manager.updateCalendar(mineRow.id, { color: '#ff0000' });
		expect((await manager.events(...range))[0].color).toBe('#ff0000');
		await manager.updateCalendar(mineRow.id, { enabled: false });
		expect(await manager.events(...range)).toEqual([]);
		await expect(manager.updateCalendar(mineRow.id, { color: 'rot' })).rejects.toThrow();
	});
});
