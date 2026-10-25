import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import AddressInput, { currentEntry, formatPerson } from './address-input.svelte';

const people = [
	{ name: 'Anna Becker', address: 'anna@firma.de' },
	{ name: 'Lea Hoffmann', address: 'lea@beispiel.org' },
	{ address: 'andreas@verein.de' }
];

describe('helpers', () => {
	it('writes a person as name and address, quoting where needed', () => {
		expect(formatPerson({ name: 'Anna Becker', address: 'anna@firma.de' })).toBe(
			'Anna Becker <anna@firma.de>'
		);
		expect(formatPerson({ name: 'Becker, Anna', address: 'anna@firma.de' })).toBe(
			'"Becker, Anna" <anna@firma.de>'
		);
		expect(formatPerson({ address: 'anna@firma.de' })).toBe('anna@firma.de');
	});

	it('finds the entry being typed, ignoring commas in quotes', () => {
		expect(currentEntry('Anna <a@x.de>, le')).toEqual({ start: 14, text: 'le' });
		expect(currentEntry('"Becker, Anna" <a@x.de>; jo')).toMatchObject({ text: 'jo' });
		expect(currentEntry('an')).toEqual({ start: 0, text: 'an' });
	});
});

describe('AddressInput', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('suggests people for the entry being typed and takes one with the keyboard', async () => {
		const suggestAddresses = vi.fn(async (text: string) =>
			people.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(text.toLowerCase()))
		);
		fakeVelo({ mail: { suggestAddresses } });
		const onvalue = vi.fn();
		render(AddressInput, { label: 'An', onvalue });
		const input = page.getByRole('combobox', { name: 'An' });

		await input.click();
		await userEvent.keyboard('an');
		// "an" is in "Hoffmann" too.
		await expect.element(page.getByRole('option')).toHaveLength(3);
		await expect.element(page.getByRole('option').first()).toHaveTextContent('Anna Becker');
		await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
		await expect.element(input).toHaveValue('andreas@verein.de, ');
		expect(onvalue).toHaveBeenCalledWith('andreas@verein.de, ');
		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();

		// The next entry after the comma gets its own suggestions.
		await userEvent.keyboard('hoff');
		await expect.element(page.getByRole('option')).toHaveTextContent('Lea Hoffmann');
		expect(suggestAddresses).toHaveBeenLastCalledWith('hoff');
		await userEvent.keyboard('{Tab}');
		await expect.element(input).toHaveValue('andreas@verein.de, Lea Hoffmann <lea@beispiel.org>, ');
	});

	it('closes the list with Escape and keeps what was typed', async () => {
		fakeVelo({ mail: { suggestAddresses: vi.fn(async () => people) } });
		render(AddressInput, { label: 'An' });
		await page.getByRole('combobox', { name: 'An' }).click();
		await userEvent.keyboard('a');
		await expect.element(page.getByRole('listbox')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
		await expect.element(page.getByRole('combobox', { name: 'An' })).toHaveValue('a');
	});

	it('takes only the address for a single field, also by click', async () => {
		fakeVelo({ mail: { suggestAddresses: vi.fn(async () => people.slice(1, 2)) } });
		render(AddressInput, { label: 'Absender', multiple: false });
		await page.getByRole('combobox', { name: 'Absender' }).click();
		await userEvent.keyboard('lea');
		await page.getByRole('option', { name: /Lea Hoffmann/ }).click();
		await expect
			.element(page.getByRole('combobox', { name: 'Absender' }))
			.toHaveValue('lea@beispiel.org');
	});
});
