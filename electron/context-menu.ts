// The right-click menu: open or copy a link (also a link styled as a button in
// a mail), copy selected text, and cut, copy and paste in input fields. It
// works in the mail's frame too, since that frame is part of the same page.
import { m } from '../src/lib/paraglide/messages.js';
import {
	clipboard,
	Menu,
	type ContextMenuParams,
	type MenuItemConstructorOptions,
	type WebContents
} from 'electron';

/** The links the app hands to the system: web pages and mail addresses. */
export function opensExternally(url: string) {
	return /^(https:|mailto:)/i.test(url);
}

/** "anna@beispiel.de" for "mailto:anna@beispiel.de?subject=Hallo". */
export function mailAddress(url: string) {
	const address = url.replace(/^mailto:/i, '').split('?')[0];
	try {
		return decodeURIComponent(address);
	} catch {
		return address;
	}
}

export interface MenuActions {
	open(url: string): void;
	copyText(text: string): void;
	copy(): void;
	cut(): void;
	paste(): void;
	selectAll(): void;
}

type Params = Pick<ContextMenuParams, 'linkURL' | 'selectionText' | 'isEditable'> & {
	editFlags: Pick<ContextMenuParams['editFlags'], 'canCut' | 'canCopy' | 'canPaste'>;
};

/** The entries for where the user clicked; none where there is nothing to do. */
export function contextMenuItems(params: Params, actions: MenuActions) {
	const items: MenuItemConstructorOptions[] = [];
	const link = params.linkURL;
	if (link) {
		const mailto = /^mailto:/i.test(link);
		if (opensExternally(link)) {
			items.push({ label: m.menu_link_open(), click: () => actions.open(link) });
		}
		items.push(
			mailto
				? { label: m.menu_address_copy(), click: () => actions.copyText(mailAddress(link)) }
				: { label: m.menu_link_copy(), click: () => actions.copyText(link) }
		);
	}
	if (params.isEditable) {
		if (items.length) items.push({ type: 'separator' });
		items.push(
			{ label: m.menu_cut(), enabled: params.editFlags.canCut, click: actions.cut },
			{ label: m.menu_copy(), enabled: params.editFlags.canCopy, click: actions.copy },
			{ label: m.menu_paste(), enabled: params.editFlags.canPaste, click: actions.paste },
			{ type: 'separator' },
			{ label: m.menu_select_all(), click: actions.selectAll }
		);
	} else if (params.selectionText.trim()) {
		if (items.length) items.push({ type: 'separator' });
		items.push({ label: m.menu_copy(), click: actions.copy });
	}
	return items;
}

/** Shows the menu on right-click in `contents`. */
export function attachContextMenu(contents: WebContents, open: (url: string) => void) {
	contents.on('context-menu', (_event, params) => {
		const items = contextMenuItems(params, {
			open,
			copyText: (text) => clipboard.writeText(text),
			// The focused frame's selection, the mail's included.
			copy: () => contents.copy(),
			cut: () => contents.cut(),
			paste: () => contents.paste(),
			selectAll: () => contents.selectAll()
		});
		if (items.length) Menu.buildFromTemplate(items).popup();
	});
}
