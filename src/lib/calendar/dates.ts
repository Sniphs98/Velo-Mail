// Date arithmetic for the calendar views, in local time. Weeks start on Monday.

export type CalendarView = 'day' | 'week' | 'month';

const dayMs = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate() + days,
		date.getHours(),
		date.getMinutes()
	);
}

export function startOfWeek(date: Date) {
	const day = startOfDay(date);
	return addDays(day, -((day.getDay() + 6) % 7));
}

export function sameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** The days a view shows: one, seven, or the six weeks around a month. */
export function visibleDays(view: CalendarView, cursor: Date): Date[] {
	if (view === 'day') return [startOfDay(cursor)];
	const first =
		view === 'week'
			? startOfWeek(cursor)
			: startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
	return Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) => addDays(first, i));
}

/** One step back or forward in the view. */
export function step(view: CalendarView, cursor: Date, direction: 1 | -1) {
	if (view === 'month') return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
	return addDays(cursor, (view === 'week' ? 7 : 1) * direction);
}

const monthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const full = new Intl.DateTimeFormat('de-DE', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	year: 'numeric'
});
const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

/** "Oktober 2026", "26. Okt. – 1. Nov. 2026" or "Montag, 26. Oktober 2026". */
export function viewTitle(view: CalendarView, cursor: Date) {
	if (view === 'month') return monthYear.format(cursor);
	if (view === 'day') return full.format(cursor);
	const [first] = visibleDays('week', cursor);
	const last = addDays(first, 6);
	return `${dayMonth.format(first)} – ${dayMonth.format(last)} ${last.getFullYear()}`;
}

export function timeOf(ms: number) {
	return clock.format(ms);
}

/** Calendar week number (ISO 8601). */
export function weekNumber(date: Date) {
	const thursday = addDays(startOfWeek(date), 3);
	const firstThursday = addDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
	return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * dayMs));
}

/** "2026-10-27" for <input type=date>, "09:30" for <input type=time>. */
export function dateValue(ms: number) {
	const d = new Date(ms);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeValue(ms: number) {
	const d = new Date(ms);
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Back from the two inputs; local time. */
export function fromInputs(date: string, time = '00:00') {
	const [y, m, d] = date.split('-').map(Number);
	const [h, min] = time.split(':').map(Number);
	return new Date(y, m - 1, d, h || 0, min || 0).getTime();
}
