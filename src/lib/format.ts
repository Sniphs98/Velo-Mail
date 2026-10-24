const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const short = new Intl.DateTimeFormat('de-DE', {
	day: '2-digit',
	month: '2-digit',
	year: '2-digit'
});
const full = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'short' });

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Short date for the message list: 09:42, Gestern, Mo, 12.10., 12.10.25. */
export function listDate(ms: number, now = new Date()): string {
	const date = new Date(ms);
	const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
	if (days <= 0) return time.format(date);
	if (days === 1) return 'Gestern';
	if (days < 7) return weekday.format(date).replace('.', '');
	if (date.getFullYear() === now.getFullYear()) return dayMonth.format(date);
	return short.format(date);
}

/** Full date for the reading pane, e.g. "Samstag, 24. Oktober 2026 um 09:42". */
export function fullDate(ms: number): string {
	return full.format(new Date(ms));
}
