import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SearchFilters } from '#lib/api.ts';
import { noFilters } from '#lib/search.ts';
import SearchFiltersPanel, { rangeStart } from './search-filters.svelte';

const accounts = [
	{ id: 1, name: 'Privat', email: 'du@beispiel.de', color: '#ea580c', signature: '' },
	{ id: 2, name: 'Arbeit', email: 'du@firma.de', color: '#16a34a', signature: '' },
	{ id: 3, name: 'Verein', email: 'du@verein.de', color: '#7c3aed', signature: '' }
];

/** Renders the panel and keeps its filters like the page does. */
function setup() {
	let filters: SearchFilters = { ...noFilters };
	const onfilter = vi.fn((next: SearchFilters) => {
		filters = next;
		screen.rerender({ filters });
	});
	const screen = render(SearchFiltersPanel, { filters, accounts, onfilter });
	return { onfilter, current: () => filters };
}

describe('rangeStart', () => {
	it('starts presets at local midnight, that many days back', () => {
		const now = new Date(2026, 9, 25, 18, 30);
		expect(rangeStart('today', now)).toBe(new Date(2026, 9, 25).getTime());
		expect(rangeStart('week', now)).toBe(new Date(2026, 9, 19).getTime());
		expect(rangeStart('month', now)).toBe(new Date(2026, 8, 26).getTime());
		expect(rangeStart('any', now)).toBeNull();
	});
});

describe('SearchFilters', () => {
	it('narrows to several accounts at once', async () => {
		const { current } = setup();
		await page.getByRole('button', { name: 'Privat' }).click();
		await page.getByRole('button', { name: 'Verein' }).click();
		expect(current().accounts).toEqual([1, 3]);
		await expect
			.element(page.getByRole('button', { name: 'Verein' }))
			.toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Privat' }).click();
		expect(current().accounts).toEqual([3]);
	});

	it('sets a time range, a preset or chosen days', async () => {
		const { current } = setup();
		await page.getByRole('combobox', { name: 'Zeitraum' }).selectOptions('7 Tage');
		expect(current().since).toBe(rangeStart('week'));
		expect(current().until).toBeNull();

		await page.getByRole('combobox', { name: 'Zeitraum' }).selectOptions('Von – bis …');
		await page.getByLabelText('Von').fill('2026-10-01');
		await page.getByLabelText('Bis').fill('2026-10-31');
		expect(current().since).toBe(new Date(2026, 9, 1).getTime());
		// The whole last day counts.
		expect(current().until).toBe(new Date(2026, 10, 1).getTime());
	});

	it('filters by sender, attachments and unread, and resets', async () => {
		const { current } = setup();
		await page.getByLabelText('Absender').fill('jonas');
		await vi.waitFor(() => expect(current().from).toBe('jonas'));
		await page.getByRole('button', { name: 'Mit Anhang' }).click();
		await page.getByRole('button', { name: 'Ungelesen' }).click();
		expect(current()).toMatchObject({ from: 'jonas', attachments: true, unread: true });

		await page.getByRole('button', { name: 'Zurücksetzen' }).click();
		expect(current()).toEqual(noFilters);
		await expect.element(page.getByLabelText('Absender')).toHaveValue('');
	});
});
