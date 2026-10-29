import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { overwriteGetLocale } from '../src/lib/paraglide/runtime.js';

vi.mock('electron', () => ({}));
const { contextMenuItems, mailAddress, opensExternally } = await import('./context-menu');

overwriteGetLocale(() => 'de');

const flags = { canCut: false, canCopy: true, canPaste: true };
const nothing = { linkURL: '', selectionText: '', isEditable: false, editFlags: flags };

function actions() {
	return {
		open: vi.fn(),
		copyText: vi.fn(),
		copy: vi.fn(),
		cut: vi.fn(),
		paste: vi.fn(),
		selectAll: vi.fn()
	};
}

function click(items: MenuItemConstructorOptions[], label: string) {
	const item = items.find((entry) => entry.label === label);
	(item?.click as () => void)();
}

describe('contextMenuItems', () => {
	it('opens or copies a link, a button-like one included', () => {
		const act = actions();
		const items = contextMenuItems({ ...nothing, linkURL: 'https://shop.example/a?b=1' }, act);
		expect(items.map((item) => item.label)).toEqual(['Link öffnen', 'Link kopieren']);
		click(items, 'Link öffnen');
		expect(act.open).toHaveBeenCalledWith('https://shop.example/a?b=1');
		click(items, 'Link kopieren');
		expect(act.copyText).toHaveBeenCalledWith('https://shop.example/a?b=1');
	});

	it('copies the address of a mailto: link', () => {
		const act = actions();
		const items = contextMenuItems(
			{ ...nothing, linkURL: 'mailto:anna%40beispiel.de?subject=Hallo' },
			act
		);
		expect(items.map((item) => item.label)).toEqual(['Link öffnen', 'E-Mail-Adresse kopieren']);
		click(items, 'E-Mail-Adresse kopieren');
		expect(act.copyText).toHaveBeenCalledWith('anna@beispiel.de');
	});

	it('only copies links the app would not open, like http:', () => {
		const items = contextMenuItems({ ...nothing, linkURL: 'http://alt.example' }, actions());
		expect(items.map((item) => item.label)).toEqual(['Link kopieren']);
	});

	it('copies selected text, also next to a link', () => {
		const act = actions();
		const items = contextMenuItems({ ...nothing, selectionText: 'Hallo Welt' }, act);
		expect(items.map((item) => item.label)).toEqual(['Kopieren']);
		click(items, 'Kopieren');
		expect(act.copy).toHaveBeenCalled();

		const both = contextMenuItems(
			{ ...nothing, linkURL: 'https://x.example', selectionText: 'Hier' },
			actions()
		);
		expect(both.map((item) => item.label ?? item.type)).toEqual([
			'Link öffnen',
			'Link kopieren',
			'separator',
			'Kopieren'
		]);
	});

	it('offers cut, copy and paste in input fields', () => {
		const items = contextMenuItems({ ...nothing, isEditable: true }, actions());
		expect(items.map((item) => [item.label ?? item.type, item.enabled])).toEqual([
			['Ausschneiden', false],
			['Kopieren', true],
			['Einfügen', true],
			['separator', undefined],
			['Alles auswählen', undefined]
		]);
	});

	it('shows nothing where there is nothing to do', () => {
		expect(contextMenuItems(nothing, actions())).toEqual([]);
		expect(contextMenuItems({ ...nothing, selectionText: '  ' }, actions())).toEqual([]);
	});
});

describe('links', () => {
	it('hands only https: and mailto: links to the system', () => {
		expect(opensExternally('https://a.example')).toBe(true);
		expect(opensExternally('MAILTO:a@b.de')).toBe(true);
		expect(opensExternally('http://a.example')).toBe(false);
		expect(opensExternally('javascript:alert(1)')).toBe(false);
		expect(opensExternally('file:///etc/passwd')).toBe(false);
	});

	it('reads the address of a mailto: link', () => {
		expect(mailAddress('mailto:a@b.de')).toBe('a@b.de');
		expect(mailAddress('mailto:a%40b.de?subject=x')).toBe('a@b.de');
		expect(mailAddress('mailto:%E0')).toBe('%E0');
	});
});
