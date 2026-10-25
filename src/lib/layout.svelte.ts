// Pane widths the user chose, remembered on this computer.

const key = 'velo:layout';
export const sidebarWidth = { min: 160, max: 360, initial: 208 };
export const listWidth = { min: 260, max: 600, initial: 320 };

function stored(): { sidebar?: number; list?: number } {
	try {
		return JSON.parse(localStorage.getItem(key) ?? '{}');
	} catch {
		return {};
	}
}

class Layout {
	sidebar = $state(stored().sidebar ?? sidebarWidth.initial);
	list = $state(stored().list ?? listWidth.initial);

	save() {
		try {
			localStorage.setItem(key, JSON.stringify({ sidebar: this.sidebar, list: this.list }));
		} catch {
			// Private storage off: the widths last until the app closes.
		}
	}
}

export const layout = new Layout();
