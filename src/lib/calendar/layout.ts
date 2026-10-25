// Where timed events sit in a day column: overlapping ones side by side, each
// group as wide as it needs to be.

export interface Placed<T> {
	event: T;
	/** Minutes after midnight, cut to the day. */
	top: number;
	height: number;
	/** Column within its group and how many columns the group has. */
	column: number;
	columns: number;
}

interface Timed {
	start: number;
	end: number;
}

/** Events of one day (`dayStart` = local midnight), placed for a 24-hour column. */
export function placeEvents<T extends Timed>(
	events: T[],
	dayStart: number,
	minHeight = 20
): Placed<T>[] {
	const dayEnd = dayStart + 24 * 60 * 60 * 1000;
	const visible = events
		.filter((e) => e.start < dayEnd && (e.end > dayStart || e.start >= dayStart))
		.map((event) => {
			const top = Math.max(0, (event.start - dayStart) / 60_000);
			const bottom = Math.min(24 * 60, (event.end - dayStart) / 60_000);
			return { event, top, height: Math.max(minHeight, bottom - top), column: 0, columns: 1 };
		})
		.sort((a, b) => a.top - b.top || b.height - a.height);

	// Groups of events that overlap one another, directly or through others.
	let group: typeof visible = [];
	let groupEnd = -1;
	const close = () => {
		const ends: number[] = [];
		for (const placed of group) {
			let column = ends.findIndex((end) => end <= placed.top);
			if (column === -1) column = ends.length;
			ends[column] = placed.top + placed.height;
			placed.column = column;
		}
		for (const placed of group) placed.columns = ends.length;
		group = [];
	};
	for (const placed of visible) {
		if (placed.top >= groupEnd) close();
		group.push(placed);
		groupEnd = Math.max(groupEnd, placed.top + placed.height);
	}
	close();
	return visible;
}

/**
 * Where a dragged event lands: moved by `pixels` down (at `hourHeight` pixels
 * per hour, snapped to `step` minutes) and by whole days, keeping its length.
 */
export function dragged(
	event: Timed,
	pixels: number,
	hourHeight: number,
	dayShift: number,
	step = 15
): Timed {
	const minutes = Math.round((pixels / hourHeight) * (60 / step)) * step;
	const shift = minutes * 60_000 + dayShift;
	return { start: event.start + shift, end: event.end + shift };
}
