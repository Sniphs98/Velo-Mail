import { velo, type Calendar, type CalendarEvent, type CalendarSource } from '#lib/api.ts';
import { step, visibleDays, type CalendarView } from '#lib/calendar/dates.ts';

/** What the calendar shows: sources, calendars and the events of the visible days. */
class CalendarState {
	view = $state<CalendarView>('week');
	cursor = $state(new Date());
	sources = $state<CalendarSource[]>([]);
	calendars = $state<Calendar[]>([]);
	events = $state<CalendarEvent[]>([]);

	days = $derived(visibleDays(this.view, this.cursor));

	async load() {
		const api = velo();
		if (!api) return;
		const days = this.days;
		const from = days[0].getTime();
		const to = new Date(
			days.at(-1)!.getFullYear(),
			days.at(-1)!.getMonth(),
			days.at(-1)!.getDate() + 1
		).getTime();
		const [sources, calendars, events] = await Promise.all([
			api.calendar.sources(),
			api.calendar.calendars(),
			api.calendar.events(from, to)
		]);
		// Only if the view did not move on meanwhile.
		if (days !== this.days) return;
		this.sources = sources;
		this.calendars = calendars;
		this.events = events;
	}

	show(view: CalendarView, cursor = this.cursor) {
		this.view = view;
		this.cursor = cursor;
		return this.load();
	}

	move(direction: 1 | -1) {
		this.cursor = step(this.view, this.cursor, direction);
		return this.load();
	}

	today() {
		this.cursor = new Date();
		return this.load();
	}

	async toggle(calendar: Calendar) {
		await velo()?.calendar.updateCalendar(calendar.id, { enabled: !calendar.enabled });
	}

	/** Follows changes from the main process; returns the unsubscribe. */
	connect() {
		const api = velo();
		if (!api) return () => {};
		const off = api.calendar.onChanged(() => this.load());
		this.load();
		return off;
	}
}

export const calendar = new CalendarState();

/** Which part of the app is shown. */
class AppMode {
	current = $state<'mail' | 'calendar'>('mail');
}

export const mode = new AppMode();
