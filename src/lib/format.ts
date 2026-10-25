import { m } from '#lib/paraglide/messages.js';
import { dateFormat, intlLocale, timeFormat } from '#lib/language.ts';

const time = timeFormat;
const weekday = () => dateFormat({ weekday: 'short' });
const dayMonth = () => dateFormat({ day: '2-digit', month: '2-digit' });
const short = () => dateFormat({ day: '2-digit', month: '2-digit', year: '2-digit' });
const full = () => dateFormat({ dateStyle: 'full', timeStyle: 'short' });

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Short date for the message list: 09:42, Gestern, Mo, 12.10., 12.10.25. */
export function listDate(ms: number, now = new Date()): string {
	const date = new Date(ms);
	const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
	if (days <= 0) return time().format(date);
	if (days === 1) return m.yesterday();
	if (days < 7) return weekday().format(date).replace('.', '');
	if (date.getFullYear() === now.getFullYear()) return dayMonth().format(date);
	return short().format(date);
}

/** Full date for the reading pane, e.g. "Samstag, 24. Oktober 2026 um 09:42". */
export function fullDate(ms: number): string {
	return full().format(new Date(ms));
}

const eventDay = () =>
	dateFormat({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

/**
 * When an event takes place, e.g. "Di., 3. November 2026 · 10:00–11:00" or
 * "Di., 3. November 2026 (ganztägig)". All-day events end the midnight after.
 */
export function eventTime(start: number, end: number, allDay: boolean): string {
	const from = new Date(start);
	if (allDay) {
		const last = new Date(Math.max(start, end - 1));
		return startOfDay(last) === startOfDay(from)
			? m.event_all_day({ day: eventDay().format(from) })
			: `${eventDay().format(from)} – ${eventDay().format(last)}`;
	}
	const to = new Date(end);
	return startOfDay(to) === startOfDay(from) || end === start
		? `${eventDay().format(from)} · ${time().format(from)}–${time().format(to)}`
		: `${eventDay().format(from)}, ${time().format(from)} – ${eventDay().format(to)}, ${time().format(to)}`;
}

/** File size like "12 KB" or "3,4 MB". */
export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const digits = value < 10 ? 1 : 0;
	return `${value.toLocaleString(intlLocale(), { maximumFractionDigits: digits })} ${units[unit]}`;
}
