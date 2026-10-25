// Which accounts are folded in the sidebar, and which folders stay visible
// then (pinned); remembered on this computer, like the pane widths.
import type { Mailbox } from '#lib/api.ts';

const key = 'velo:sidebar';

interface Stored {
	collapsed?: number[];
	/** Mailbox id → pinned; the inbox counts as pinned until unpinned. */
	pins?: Record<number, boolean>;
}

function stored(): Stored {
	try {
		return JSON.parse(localStorage.getItem(key) ?? '{}');
	} catch {
		return {};
	}
}

class Sidebar {
	collapsed = $state<number[]>(stored().collapsed ?? []);
	pins = $state<Record<number, boolean>>(stored().pins ?? {});

	isCollapsed(accountId: number) {
		return this.collapsed.includes(accountId);
	}

	toggle(accountId: number) {
		this.collapsed = this.isCollapsed(accountId)
			? this.collapsed.filter((id) => id !== accountId)
			: [...this.collapsed, accountId];
		this.save();
	}

	isPinned(box: Mailbox) {
		return this.pins[box.id] ?? box.role === 'inbox';
	}

	pin(box: Mailbox, pinned: boolean) {
		this.pins = { ...this.pins, [box.id]: pinned };
		this.save();
	}

	private save() {
		try {
			localStorage.setItem(key, JSON.stringify({ collapsed: this.collapsed, pins: this.pins }));
		} catch {
			// Private storage off: it lasts until the app closes.
		}
	}
}

export const sidebar = new Sidebar();
