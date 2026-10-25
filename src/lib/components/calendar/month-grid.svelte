<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { dateFormat } from '#lib/language.ts';
	import type { CalendarEvent } from '#lib/api.ts';
	import { sameDay, timeOf } from '#lib/calendar/dates.ts';

	let {
		days,
		month,
		events,
		onday,
		onopen
	}: {
		/** 42 days, starting on a Monday. */
		days: Date[];
		/** The month shown; days of other months are dimmed. */
		month: number;
		events: CalendarEvent[];
		/** A day was clicked: show it. */
		onday: (day: Date) => void;
		onopen: (event: CalendarEvent) => void;
	} = $props();

	// Monday to Sunday, from a week that starts on a Monday.
	const names = Array.from({ length: 7 }, (_, i) =>
		dateFormat({ weekday: 'short' })
			.format(new Date(2026, 0, 5 + i))
			.replace('.', '')
	);
	const shown = 3;

	const of = (day: Date) => {
		const start = day.getTime();
		const end = start + 24 * 3600_000;
		return events.filter((e) => e.start < end && (e.end > start || e.start >= start));
	};
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="grid grid-cols-7 border-b">
		{#each names as name (name)}
			<span class="px-2 py-1 text-xs text-muted-foreground">{name}</span>
		{/each}
	</div>
	<div class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
		{#each days as day (day.getTime())}
			{@const list = of(day)}
			{@const today = sameDay(day, new Date())}
			<div
				class="flex min-h-0 flex-col gap-0.5 overflow-hidden border-r border-b p-1 [&:nth-child(7n)]:border-r-0"
				class:bg-muted={day.getMonth() !== month}
			>
				<button
					type="button"
					class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium hover:bg-muted"
					class:bg-primary={today}
					class:text-primary-foreground={today}
					class:text-muted-foreground={day.getMonth() !== month && !today}
					aria-label={m.calendar_show_day({
						day: dateFormat({ day: 'numeric', month: 'long' }).format(day)
					})}
					onclick={() => onday(day)}
				>
					{day.getDate()}
				</button>
				{#each list.slice(0, shown) as event (event.id + ':' + event.start)}
					<button
						type="button"
						class="flex items-center gap-1 truncate rounded px-1 text-left text-[11px] hover:bg-muted"
						onclick={() => onopen(event)}
					>
						<span class="size-1.5 shrink-0 rounded-full" style:background={event.color}></span>
						{#if !event.allDay}<span class="text-muted-foreground">{timeOf(event.start)}</span>{/if}
						<span class="truncate">{event.summary || m.event_untitled()}</span>
					</button>
				{/each}
				{#if list.length > shown}
					<button
						type="button"
						class="px-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
						onclick={() => onday(day)}
					>
						{m.calendar_more({ count: list.length - shown })}
					</button>
				{/if}
			</div>
		{/each}
	</div>
</div>
