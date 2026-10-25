<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { dateFormat } from '#lib/language.ts';
	import type { CalendarEvent } from '#lib/api.ts';
	import { sameDay, timeOf } from '#lib/calendar/dates.ts';
	import { dragged, placeEvents } from '#lib/calendar/layout.ts';

	let {
		days,
		events,
		onslot,
		onopen,
		onmove
	}: {
		days: Date[];
		events: CalendarEvent[];
		/** A free slot was clicked: start of the half hour, in ms. */
		onslot: (start: number) => void;
		onopen: (event: CalendarEvent) => void;
		/** An event was dragged to a new time (and maybe day). */
		onmove?: (event: CalendarEvent, start: number, end: number) => void;
	} = $props();

	/** Pixels per hour. */
	const hour = 48;
	const weekday = dateFormat({ weekday: 'short' });

	let scroller = $state<HTMLDivElement>();
	let now = $state(Date.now());

	// The working day in view at first; the line for "now" moves every minute.
	$effect(() => {
		if (scroller) scroller.scrollTop = 7 * hour - 12;
	});
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const allDay = $derived(events.filter((e) => e.allDay || e.end - e.start >= 24 * 3600_000));
	const timed = $derived(events.filter((e) => !allDay.includes(e)));

	const on = (event: CalendarEvent, day: Date) => {
		const start = day.getTime();
		const end = start + 24 * 3600_000;
		return event.start < end && event.end > start;
	};

	/** The event being dragged: where it was picked up and where it would land. */
	let drag = $state<{
		event: CalendarEvent;
		x: number;
		y: number;
		day: number;
		moved: boolean;
		start: number;
		end: number;
		over: number;
	} | null>(null);
	/** Set after a drag, so the click that ends it does not open the event. */
	let dropped = false;

	const keyOf = (event: CalendarEvent) => `${event.id}:${event.start}`;

	function pick(pointer: PointerEvent, event: CalendarEvent, day: Date) {
		if (!onmove || pointer.button !== 0) return;
		// Keeps the moves coming while the pointer leaves the event.
		try {
			(pointer.currentTarget as HTMLElement).setPointerCapture(pointer.pointerId);
		} catch {
			// Not an active pointer (synthetic events); moves still arrive while over it.
		}
		drag = {
			event,
			x: pointer.clientX,
			y: pointer.clientY,
			day: day.getTime(),
			moved: false,
			start: event.start,
			end: event.end,
			over: day.getTime()
		};
	}

	function follow(pointer: PointerEvent) {
		if (!drag) return;
		const dy = pointer.clientY - drag.y;
		if (!drag.moved && Math.hypot(pointer.clientX - drag.x, dy) < 4) return;
		// The day column under the pointer, if any.
		const column = document
			.elementsFromPoint(pointer.clientX, pointer.clientY)
			.find((element) => element instanceof HTMLElement && element.dataset.day) as
			HTMLElement | undefined;
		const over = column ? Number(column.dataset.day) : drag.over;
		const landing = dragged(drag.event, dy, hour, over - drag.day);
		drag = { ...drag, moved: true, over, ...landing };
	}

	function drop() {
		if (!drag) return;
		const { event, moved, start, end } = drag;
		drag = null;
		if (!moved) return;
		dropped = true;
		if (start !== event.start) onmove?.(event, start, end);
	}

	function open(event: CalendarEvent) {
		if (dropped) {
			dropped = false;
			return;
		}
		onopen(event);
	}

	function slot(event: MouseEvent, day: Date) {
		if (event.target !== event.currentTarget) return;
		const minutes = Math.floor((event.offsetY / hour) * 2) * 30;
		onslot(day.getTime() + minutes * 60_000);
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!-- Day headers and all-day events -->
	<div class="flex border-b pr-2.5">
		<div class="w-12 shrink-0"></div>
		{#each days as day (day.getTime())}
			{@const today = sameDay(day, new Date(now))}
			<div class="flex min-w-0 flex-1 flex-col gap-1 border-l px-1 pb-1.5">
				<div class="flex items-baseline gap-1.5 px-1 text-xs">
					<span class="text-muted-foreground">{weekday.format(day)}</span>
					<span
						class="flex size-6 items-center justify-center rounded-full text-sm font-semibold"
						class:bg-primary={today}
						class:text-primary-foreground={today}
					>
						{day.getDate()}
					</span>
				</div>
				{#each allDay.filter((e) => on(e, day)) as event (event.id + ':' + event.start)}
					<button
						type="button"
						class="truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium text-white"
						style:background={event.color}
						onclick={() => onopen(event)}
					>
						{event.summary || m.event_untitled()}
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<div bind:this={scroller} class="relative min-h-0 flex-1 overflow-y-auto">
		<div class="relative flex" style:height="{24 * hour}px">
			<div class="w-12 shrink-0">
				{#each Array.from({ length: 23 }, (_, i) => i + 1) as h (h)}
					<span
						class="absolute -translate-y-1/2 pl-1 text-[11px] text-muted-foreground"
						style:top="{h * hour}px"
					>
						{String(h).padStart(2, '0')}:00
					</span>
				{/each}
			</div>
			{#each days as day (day.getTime())}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="relative min-w-0 flex-1 border-l"
					style:background-image="repeating-linear-gradient(to bottom, var(--border) 0 1px,
					transparent 1px {hour}px)"
					onclick={(event) => slot(event, day)}
					data-day={day.getTime()}
				>
					{#each placeEvents(timed, day.getTime(), 24) as placed (placed.event.id + ':' + placed.event.start)}
						{@const event = placed.event}
						{@const short = placed.height < 40}
						<button
							type="button"
							class="absolute touch-none overflow-hidden rounded-md border border-card px-1.5 text-left text-xs leading-tight text-white"
							class:py-0.5={!short}
							class:text-[11px]={short}
							class:opacity-40={drag?.moved && keyOf(drag.event) === keyOf(event)}
							style:top="{(placed.top / 60) * hour}px"
							style:height="{(placed.height / 60) * hour}px"
							style:left="calc({(placed.column / placed.columns) * 100}% + 2px)"
							style:width="calc({100 / placed.columns}% - 4px)"
							style:background={event.color}
							onclick={() => open(event)}
							onpointerdown={(pointer) => pick(pointer, event, day)}
							onpointermove={follow}
							onpointerup={drop}
							onpointercancel={() => (drag = null)}
						>
							<span class="block truncate font-medium">
								{event.summary || m.event_untitled()}
								{#if short}<span class="font-normal opacity-90">{timeOf(event.start)}</span>{/if}
							</span>
							{#if !short}
								<span class="block truncate opacity-90">
									{timeOf(event.start)} – {timeOf(event.end)}
								</span>
							{/if}
						</button>
					{/each}
					{#if drag?.moved && drag.over === day.getTime()}
						{@const top = (drag.start - day.getTime()) / 60_000}
						<div
							class="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-dashed px-1.5 py-0.5 text-xs font-medium"
							style:top="{(top / 60) * hour}px"
							style:height="{Math.max(20, ((drag.end - drag.start) / 3_600_000) * hour)}px"
							style:border-color={drag.event.color}
							style:color={drag.event.color}
							data-testid="drag-preview"
						>
							{timeOf(drag.start)} – {timeOf(drag.end)}
						</div>
					{/if}
					{#if sameDay(day, new Date(now))}
						{@const minutes = (now - day.getTime()) / 60_000}
						<div
							class="pointer-events-none absolute inset-x-0 h-0.5 bg-red-500"
							style:top="{(minutes / 60) * hour}px"
							aria-hidden="true"
						></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
