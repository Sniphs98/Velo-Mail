import { m } from '#lib/paraglide/messages.js';

/** The name of a color from colors.ts, for screen readers. */
export function colorName(color: string) {
	const names: Record<string, () => string> = {
		'#ea580c': m.color_orange,
		'#0d9488': m.color_teal,
		'#7c3aed': m.color_violet,
		'#db2777': m.color_pink,
		'#ca8a04': m.color_mustard,
		'#16a34a': m.color_green,
		'#2563eb': m.color_blue,
		'#525252': m.color_grey
	};
	return names[color]?.() ?? color;
}
