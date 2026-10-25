<script lang="ts">
	// A divider between two panes that changes the width of the one on its left:
	// drag it, use the arrow keys, or double-click to go back to the default.
	let {
		value = $bindable(),
		min,
		max,
		initial,
		label
	}: { value: number; min: number; max: number; initial: number; label: string } = $props();

	let dragging = $state(false);
	let start = { x: 0, width: 0 };

	const clamp = (width: number) => Math.round(Math.min(max, Math.max(min, width)));

	function down(event: PointerEvent) {
		if (event.button !== 0) return;
		dragging = true;
		start = { x: event.clientX, width: value };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function move(event: PointerEvent) {
		if (dragging) value = clamp(start.width + event.clientX - start.x);
	}

	function key(event: KeyboardEvent) {
		const step = event.shiftKey ? 48 : 16;
		const next = {
			ArrowLeft: value - step,
			ArrowRight: value + step,
			Home: min,
			End: max
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		value = clamp(next);
	}
</script>

<!-- A focusable separator with key and pointer handling is the ARIA pattern for resizable panes. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={value}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex="0"
	class="group relative w-2 shrink-0 cursor-col-resize touch-none outline-none"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={() => (dragging = false)}
	onpointercancel={() => (dragging = false)}
	ondblclick={() => (value = initial)}
	onkeydown={key}
>
	<span
		class="absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-border group-focus-visible:bg-ring"
		class:bg-ring={dragging}
	></span>
</div>
