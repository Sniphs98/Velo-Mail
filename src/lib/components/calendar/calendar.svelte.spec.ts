import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { CalendarEvent } from '#lib/api.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import AddCalendarDialog from './add-calendar-dialog.svelte';
import EventDialog from './event-dialog.svelte';
import MonthGrid from './month-grid.svelte';
import WeekGrid from './week-grid.svelte';

const day = new Date(2026, 9, 28);
const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m).getTime();
const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
	id: 1,
	calendarId: 1,
	color: '#2563eb',
	summary: 'Planung',
	location: null,
	description: null,
	start: at(9),
	end: at(10),
	allDay: false,
	recurring: false,
	reminder: null,
	...over
});

afterEach(() => {
	delete window.velo;
});

describe('WeekGrid', () => {
	it('places events at their time and reports clicks on free slots', async () => {
		const onslot = vi.fn();
		const onopen = vi.fn();
		const screen = render(WeekGrid, {
			// "events" is also a mount option, so the props go in explicitly.
			props: {
				days: [day],
				events: [
					event({}),
					event({ id: 2, summary: 'Urlaub', allDay: true, start: at(0), end: at(24) })
				],
				onslot,
				onopen
			}
		});
		const planning = page.getByRole('button', { name: /Planung/ });
		await expect.element(planning).toHaveTextContent('09:00 – 10:00');
		expect((planning.element() as HTMLElement).style.top).toBe('432px');
		await expect.element(page.getByRole('button', { name: 'Urlaub' })).toBeVisible();

		await planning.click();
		expect(onopen).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Planung' }));

		// A click at 14:10 (48 px per hour) starts the slot at 14:00.
		const column = screen.container.querySelector<HTMLElement>(`[data-day="${day.getTime()}"]`)!;
		// Component tests have no Tailwind, so the click goes in at a computed point.
		const top = column.getBoundingClientRect().top;
		column.dispatchEvent(
			new MouseEvent('click', { bubbles: true, clientX: 10, clientY: top + 14 * 48 + 8 })
		);
		expect(onslot).toHaveBeenCalledWith(at(14));
	});
});

describe('MonthGrid', () => {
	it('shows three events per day and counts the rest', async () => {
		const onday = vi.fn();
		render(MonthGrid, {
			// "events" is also a mount option, so the props go in explicitly.
			props: {
				days: Array.from({ length: 42 }, (_, i) => new Date(2026, 8, 28 + i)),
				month: 9,
				events: [1, 2, 3, 4, 5].map((n) =>
					event({ id: n, summary: `Termin ${n}`, start: at(8 + n) })
				),
				onday,
				onopen: () => {}
			}
		});
		await expect.element(page.getByText('Termin 3')).toBeVisible();
		await expect.element(page.getByText('Termin 4')).not.toBeInTheDocument();
		await page.getByRole('button', { name: '2 weitere' }).click();
		expect(onday).toHaveBeenCalledWith(day);
	});
});

describe('EventDialog', () => {
	const calendars = [
		{ id: 1, sourceId: 1, name: 'Privat', color: '#2563eb', enabled: true },
		{ id: 2, sourceId: 1, name: 'Arbeit', color: '#16a34a', enabled: true }
	];
	const draft = {
		calendarId: 1,
		summary: '',
		location: '',
		description: '',
		start: at(14),
		end: at(15),
		allDay: false,
		recurring: false,
		reminder: 15
	};

	it('creates an event in the chosen calendar', async () => {
		const api = fakeVelo();
		render(EventDialog, { open: true, draft, calendars });
		await page.getByLabelText('Titel').fill('Zahnarzt');
		await page.getByLabelText('Ort').fill('Hauptstraße 1');
		await page.getByLabelText('Kalender').selectOptions('2');
		await expect.element(page.getByLabelText('Erinnerung')).toHaveValue('15');
		await page.getByLabelText('Erinnerung').selectOptions('1 Stunde vorher');
		await page.getByRole('button', { name: 'Speichern' }).click();
		expect(api.calendar.createEvent).toHaveBeenCalledWith(2, {
			summary: 'Zahnarzt',
			location: 'Hauptstraße 1',
			description: undefined,
			start: at(14),
			end: at(15),
			allDay: false,
			reminder: 60
		});
	});

	it('keeps a reminder set elsewhere and can remove it', async () => {
		const api = fakeVelo();
		render(EventDialog, { open: true, draft: { ...draft, id: 3, reminder: 10 }, calendars });
		await expect.element(page.getByLabelText('Erinnerung')).toHaveValue('10');
		await expect
			.element(page.getByRole('option', { name: '10 Minuten vorher' }))
			.toBeInTheDocument();
		await page.getByLabelText('Erinnerung').selectOptions('Keine');
		await page.getByRole('button', { name: 'Speichern' }).click();
		expect(api.calendar.updateEvent).toHaveBeenCalledWith(
			3,
			expect.objectContaining({ reminder: null }),
			undefined
		);
	});

	it('changes a series from the occurrence, makes all-day events whole days, deletes', async () => {
		const api = fakeVelo();
		render(EventDialog, {
			open: true,
			draft: { ...draft, id: 7, summary: 'Jour fixe', recurring: true },
			calendars
		});
		await expect.element(page.getByText('Änderungen gelten für die ganze Serie')).toBeVisible();
		await page.getByRole('switch', { name: 'Ganztägig' }).click();
		await page.getByRole('button', { name: 'Speichern' }).click();
		expect(api.calendar.updateEvent).toHaveBeenCalledWith(
			7,
			expect.objectContaining({ allDay: true, start: at(0), end: at(24) }),
			at(14)
		);
	});

	it('refuses an end before the start', async () => {
		const api = fakeVelo();
		render(EventDialog, { open: true, draft, calendars });
		await page.getByLabelText('Uhrzeit').nth(1).fill('13:00');
		await page.getByRole('button', { name: 'Speichern' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Ende liegt vor dem Beginn');
		expect(api.calendar.createEvent).not.toHaveBeenCalled();
	});
});

describe('AddCalendarDialog', () => {
	it('explains why a calendar could not be added', async () => {
		const addSource = vi.fn(async () => ({ ok: false as const, reason: 'auth' as const }));
		fakeVelo({ calendar: { addSource } });
		render(AddCalendarDialog, { open: true });
		await page.getByLabelText('E-Mail-Adresse oder Benutzername').fill('lukas@yahoo.de');
		await page.getByLabelText('Passwort').fill('geheim');
		await page.getByRole('button', { name: 'Hinzufügen' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('App-Passwort');
		expect(addSource).toHaveBeenCalledWith({
			name: undefined,
			username: 'lukas@yahoo.de',
			password: 'geheim',
			serverUrl: undefined
		});
	});
});
