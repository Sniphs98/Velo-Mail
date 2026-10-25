import { describe, expect, it } from 'vitest';
import {
	addDays,
	dateValue,
	fromInputs,
	startOfWeek,
	step,
	timeValue,
	viewTitle,
	visibleDays,
	weekNumber
} from './dates';
import { placeEvents } from './layout';

describe('dates', () => {
	it('starts weeks on Monday and shows six weeks for a month', () => {
		const wednesday = new Date(2026, 9, 28);
		expect(startOfWeek(wednesday)).toEqual(new Date(2026, 9, 26));
		expect(startOfWeek(new Date(2026, 10, 1))).toEqual(new Date(2026, 9, 26));
		const month = visibleDays('month', wednesday);
		expect(month).toHaveLength(42);
		expect(month[0]).toEqual(new Date(2026, 8, 28));
		expect(visibleDays('week', wednesday).map((d) => d.getDate())).toEqual([
			26, 27, 28, 29, 30, 31, 1
		]);
	});

	it('steps through days, weeks and months', () => {
		const day = new Date(2026, 9, 31);
		expect(step('day', day, 1)).toEqual(new Date(2026, 10, 1));
		expect(step('week', day, -1)).toEqual(new Date(2026, 9, 24));
		expect(step('month', day, 1)).toEqual(new Date(2026, 10, 1));
		// Across the change to winter time a day is still a day.
		expect(addDays(new Date(2026, 9, 24, 9), 2)).toEqual(new Date(2026, 9, 26, 9));
	});

	it('titles views in German', () => {
		const day = new Date(2026, 9, 28);
		expect(viewTitle('month', day)).toBe('Oktober 2026');
		expect(viewTitle('day', day)).toBe('Mittwoch, 28. Oktober 2026');
		expect(viewTitle('week', day)).toBe('26. Okt. – 1. Nov. 2026');
	});

	it('counts ISO weeks and converts input values', () => {
		expect(weekNumber(new Date(2026, 9, 28))).toBe(44);
		expect(weekNumber(new Date(2027, 0, 1))).toBe(53);
		const ms = new Date(2026, 9, 28, 9, 5).getTime();
		expect(dateValue(ms)).toBe('2026-10-28');
		expect(timeValue(ms)).toBe('09:05');
		expect(fromInputs('2026-10-28', '09:05')).toBe(ms);
	});
});

describe('placeEvents', () => {
	const day = new Date(2026, 9, 28).getTime();
	const at = (h: number, m = 0) => day + (h * 60 + m) * 60_000;
	const event = (name: string, start: number, end: number) => ({ name, start, end });

	it('puts overlapping events side by side, others full width', () => {
		const placed = placeEvents(
			[
				event('a', at(9), at(10)),
				event('b', at(9, 30), at(11)),
				event('c', at(10), at(10, 30)),
				event('d', at(14), at(15))
			],
			day
		);
		expect(placed.map((p) => [p.event.name, p.top, p.column, p.columns])).toEqual([
			['a', 540, 0, 2],
			['b', 570, 1, 2],
			['c', 600, 0, 2],
			['d', 840, 0, 1]
		]);
	});

	it('cuts events at midnight and gives short ones a minimum height', () => {
		const placed = placeEvents(
			[
				event('nacht', at(-2), at(1)),
				event('kurz', at(12), at(12, 5)),
				event('morgen', at(25), at(26))
			],
			day
		);
		expect(placed.map((p) => [p.event.name, p.top, p.height])).toEqual([
			['nacht', 0, 60],
			['kurz', 720, 20]
		]);
	});
});
