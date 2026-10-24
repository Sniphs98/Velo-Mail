import { describe, expect, it } from 'vitest';
import { fileSize, listDate } from './format';

const now = new Date(2026, 9, 24, 15, 0); // Saturday

describe('listDate', () => {
	it('shortens by how long ago it was', () => {
		expect(listDate(new Date(2026, 9, 24, 9, 42).getTime(), now)).toBe('09:42');
		expect(listDate(new Date(2026, 9, 23, 23, 59).getTime(), now)).toBe('Gestern');
		expect(listDate(new Date(2026, 9, 19, 8, 0).getTime(), now)).toBe('Mo');
		expect(listDate(new Date(2026, 9, 12, 8, 0).getTime(), now)).toBe('12.10.');
		expect(listDate(new Date(2025, 9, 12, 8, 0).getTime(), now)).toBe('12.10.25');
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
});
