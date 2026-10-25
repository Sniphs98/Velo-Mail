<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { ChevronLeft, ChevronRight, Plus } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { velo, type CalendarEvent } from '#lib/api.ts';
	import { calendar } from '#lib/calendar.svelte.ts';
	import { viewTitle, weekNumber, type CalendarView } from '#lib/calendar/dates.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import EventDialog, { type EventDraft } from './event-dialog.svelte';
	import MonthGrid from './month-grid.svelte';
	import WeekGrid from './week-grid.svelte';

	let { onaddcalendar }: { onaddcalendar: () => void } = $props();

	const views: { value: CalendarView; label: string }[] = [
		{ value: 'day', label: m.calendar_day() },
		{ value: 'week', label: m.calendar_week() },
		{ value: 'month', label: m.calendar_month() }
	];

	let editing = $state(false);
	let draft = $state<EventDraft>({
		calendarId: 0,
		summary: '',
		location: '',
		description: '',
		start: 0,
		end: 0,
		allDay: false,
		recurring: false,
		reminder: null,
		recurrenceId: null
	});

	const writable = $derived(calendar.calendars.filter((c) => c.enabled));

	/** A new event at `start` (an hour long), or at the next full hour. */
	export function create(start?: number) {
		const now = new Date();
		const at =
			start ??
			new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).getTime();
		draft = {
			calendarId: writable[0]?.id ?? calendar.calendars[0]?.id ?? 0,
			summary: '',
			location: '',
			description: '',
			start: at,
			end: at + 3600_000,
			allDay: false,
			recurring: false,
			// What most calendars suggest for a new event.
			reminder: 15,
			recurrenceId: null
		};
		editing = true;
	}

	function open(event: CalendarEvent) {
		draft = {
			id: event.id,
			calendarId: event.calendarId,
			summary: event.summary,
			location: event.location ?? '',
			description: event.description ?? '',
			start: event.start,
			end: event.end,
			allDay: event.allDay,
			recurring: event.recurring,
			reminder: event.reminder,
			recurrenceId: event.recurrenceId
		};
		editing = true;
	}

	let notice = $state<string>();

	/** Dragged to a new time: shown there at once, then saved. Of a series only this occurrence moves. */
	async function move(event: CalendarEvent, start: number, end: number) {
		notice = undefined;
		const shown = calendar.events.find((e) => e.id === event.id && e.start === event.start);
		if (shown) Object.assign(shown, { start, end });
		try {
			await velo()?.calendar.updateEvent(
				event.id,
				{
					summary: event.summary,
					location: event.location ?? undefined,
					description: event.description ?? undefined,
					start,
					end,
					allDay: false
				},
				event.recurring && event.recurrenceId
					? { start: event.start, recurrenceId: event.recurrenceId, only: true }
					: undefined
			);
		} catch (cause) {
			notice = m.event_move_failed({ error: ipcErrorMessage(cause) });
			await calendar.load();
		}
	}
</script>

<section
	aria-label={m.calendar()}
	class="relative flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-card"
>
	<div class="flex flex-wrap items-center gap-2 border-b p-2.5">
		<Button variant="outline" size="sm" onclick={() => calendar.today()}>{m.today()}</Button>
		<div class="flex">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={m.back()}
				onclick={() => calendar.move(-1)}
			>
				<ChevronLeft />
			</Button>
			<Button variant="ghost" size="icon-sm" aria-label={m.next()} onclick={() => calendar.move(1)}>
				<ChevronRight />
			</Button>
		</div>
		<h1 class="font-heading text-base font-semibold">
			{viewTitle(calendar.view, calendar.cursor)}
		</h1>
		{#if calendar.view === 'week'}
			<span class="text-xs text-muted-foreground"
				>{m.calendar_week_number({ week: weekNumber(calendar.cursor) })}</span
			>
		{/if}
		<div class="flex-1"></div>
		<div role="radiogroup" aria-label={m.calendar_view()} class="flex rounded-lg bg-muted p-0.5">
			{#each views as view (view.value)}
				<button
					type="button"
					role="radio"
					aria-checked={calendar.view === view.value}
					class="rounded-md px-2.5 py-1 text-xs text-muted-foreground aria-checked:bg-card aria-checked:font-medium aria-checked:text-foreground aria-checked:shadow-sm"
					onclick={() => calendar.show(view.value)}
				>
					{view.label}
				</button>
			{/each}
		</div>
		<Button
			size="sm"
			disabled={calendar.calendars.length === 0}
			title={m.event_new_shortcut()}
			onclick={() => create()}
		>
			<Plus />
			{m.event()}
		</Button>
	</div>

	{#if calendar.sources.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
			<h2 class="font-heading text-lg font-semibold">{m.calendar_none()}</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				{m.calendar_none_hint()}
			</p>
			<Button onclick={onaddcalendar}>{m.calendar_add()}</Button>
		</div>
	{:else if calendar.view === 'month'}
		<MonthGrid
			days={calendar.days}
			month={calendar.cursor.getMonth()}
			events={calendar.events}
			onday={(day) => calendar.show('day', day)}
			onopen={open}
		/>
	{:else}
		<WeekGrid
			days={calendar.days}
			events={calendar.events}
			onslot={(start) => calendar.calendars.length > 0 && create(start)}
			onopen={open}
			onmove={move}
		/>
	{/if}
	{#if notice}
		<p
			role="alert"
			class="absolute inset-x-3 bottom-3 rounded-lg border bg-card px-3 py-2 text-sm text-destructive shadow-sm"
		>
			{notice}
		</p>
	{/if}
</section>

<EventDialog
	bind:open={editing}
	{draft}
	calendars={writable.length > 0 ? writable : calendar.calendars}
/>
