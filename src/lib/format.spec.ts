import { describe, expect, it } from 'vitest';
import { inLocale } from '#lib/testing/german.ts';
import { eventTime, fileSize, listDate } from './format';

const now = new Date(2026, 9, 24, 15, 0); // Saturday

describe('listDate', () => {
	it('shortens by how long ago it was', () => {
		expect(listDate(new Date(2026, 9, 24, 9, 42).getTime(), now)).toBe('09:42');
		expect(listDate(new Date(2026, 9, 23, 23, 59).getTime(), now)).toBe('Gestern');
		expect(listDate(new Date(2026, 9, 19, 8, 0).getTime(), now)).toBe('Mo');
		expect(listDate(new Date(2026, 9, 12, 8, 0).getTime(), now)).toBe('12.10.');
		expect(listDate(new Date(2025, 9, 12, 8, 0).getTime(), now)).toBe('12.10.25');
	});

	it('follows the language', async () => {
		await inLocale('en', () => {
			expect(listDate(new Date(2026, 9, 23, 23, 59).getTime(), now)).toBe('Yesterday');
			expect(listDate(new Date(2026, 9, 19, 8, 0).getTime(), now)).toBe('Mon');
			expect(listDate(new Date(2026, 9, 12, 8, 0).getTime(), now)).toBe('10/12');
		});
	});

	it('shows the time for dates in the future (wrong clocks)', () => {
		expect(listDate(new Date(2026, 9, 25, 8, 0).getTime(), now)).toBe('08:00');
	});
});

describe('fileSize', () => {
	it('picks a readable unit', () => {
		expect(fileSize(512)).toBe('512 B');
		expect(fileSize(12_800)).toBe('13 KB');
		expect(fileSize(3_500_000)).toBe('3,3 MB');
	});

	it('writes the decimal point of the language', async () => {
		await inLocale('en', () => expect(fileSize(3_500_000)).toBe('3.3 MB'));
	});
});

describe('eventTime', () => {
	const at = (day: number, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

	it('shows the day with start and end time', () => {
		expect(eventTime(at(3, 10), at(3, 11, 30), false)).toBe('Di., 3. November 2026 · 10:00–11:30');
	});

	it('names both days when the event runs past midnight', () => {
		expect(eventTime(at(3, 22), at(4, 1), false)).toBe(
			'Di., 3. November 2026, 22:00 – Mi., 4. November 2026, 01:00'
		);
	});

	it('shows all-day events without times, ending the day before their end', () => {
		expect(eventTime(at(3), at(4), true)).toBe('Di., 3. November 2026 (ganztägig)');
		expect(eventTime(at(3), at(6), true)).toBe('Di., 3. November 2026 – Do., 5. November 2026');
	});
});
