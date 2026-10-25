<script lang="ts">
	import { ChevronLeft, ChevronRight, Plus } from '@lucide/svelte';
	import type { CalendarEvent } from '#lib/api.ts';
	import { calendar } from '#lib/calendar.svelte.ts';
	import { viewTitle, weekNumber, type CalendarView } from '#lib/calendar/dates.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import EventDialog, { type EventDraft } from './event-dialog.svelte';
	import MonthGrid from './month-grid.svelte';
	import WeekGrid from './week-grid.svelte';

	let { onaddcalendar }: { onaddcalendar: () => void } = $props();

	const views: { value: CalendarView; label: string }[] = [
		{ value: 'day', label: 'Tag' },
		{ value: 'week', label: 'Woche' },
		{ value: 'month', label: 'Monat' }
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
		reminder: null
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
			reminder: 15
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
			reminder: event.reminder
		};
		editing = true;
	}
</script>

<section
	aria-label="Kalender"
	class="relative flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-card"
>
	<div class="flex flex-wrap items-center gap-2 border-b p-2.5">
		<Button variant="outline" size="sm" onclick={() => calendar.today()}>Heute</Button>
		<div class="flex">
			<Button variant="ghost" size="icon-sm" aria-label="Zurück" onclick={() => calendar.move(-1)}>
				<ChevronLeft />
			</Button>
			<Button variant="ghost" size="icon-sm" aria-label="Weiter" onclick={() => calendar.move(1)}>
				<ChevronRight />
			</Button>
		</div>
		<h1 class="font-heading text-base font-semibold">
			{viewTitle(calendar.view, calendar.cursor)}
		</h1>
		{#if calendar.view === 'week'}
			<span class="text-xs text-muted-foreground">KW {weekNumber(calendar.cursor)}</span>
		{/if}
		<div class="flex-1"></div>
		<div role="radiogroup" aria-label="Ansicht" class="flex rounded-lg bg-muted p-0.5">
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
			title="Neuer Termin (N)"
			onclick={() => create()}
		>
			<Plus /> Termin
		</Button>
	</div>

	{#if calendar.sources.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
			<h2 class="font-heading text-lg font-semibold">Noch kein Kalender verbunden</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				Verbinde einen Kalender über CalDAV, z. B. iCloud, Nextcloud, Posteo oder Yahoo.
			</p>
			<Button onclick={onaddcalendar}>Kalender hinzufügen</Button>
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
		/>
	{/if}
</section>

<EventDialog
	bind:open={editing}
	{draft}
	calendars={writable.length > 0 ? writable : calendar.calendars}
/>
