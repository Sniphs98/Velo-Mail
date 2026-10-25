<script lang="ts" module>
	/** A new event (no id) or one being changed. */
	export interface EventDraft {
		id?: number;
		calendarId: number;
		summary: string;
		location: string;
		description: string;
		start: number;
		end: number;
		allDay: boolean;
		recurring: boolean;
		/** Minutes before the start; null for none. */
		reminder: number | null;
		/** The occurrence of a series being changed. */
		recurrenceId: string | null;
	}

	/** The reminders offered, in minutes before the start. */
	export const reminderChoices: { minutes: number; label: string }[] = [
		{ minutes: 0, label: 'Zu Beginn' },
		{ minutes: 5, label: '5 Minuten vorher' },
		{ minutes: 15, label: '15 Minuten vorher' },
		{ minutes: 30, label: '30 Minuten vorher' },
		{ minutes: 60, label: '1 Stunde vorher' },
		{ minutes: 1440, label: '1 Tag vorher' }
	];
</script>

<script lang="ts">
	import { Repeat } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { velo, type Calendar } from '#lib/api.ts';
	import { dateValue, fromInputs, timeValue } from '#lib/calendar/dates.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as Field from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';

	let {
		open = $bindable(false),
		draft,
		calendars
	}: { open?: boolean; draft: EventDraft; calendars: Calendar[] } = $props();

	const day = 24 * 3600_000;
	let form = $state({
		calendarId: 0,
		summary: '',
		location: '',
		description: '',
		startDate: '',
		startTime: '',
		endDate: '',
		endTime: '',
		allDay: false,
		/** Minutes as text for the select; '' for none. */
		reminder: ''
	});
	let error = $state<string>();
	let busy = $state(false);
	/** For an occurrence of a series: change only it, or the whole series. */
	let scope = $state<'only' | 'all'>('only');
	const occurrence = $derived(
		draft.id !== undefined && draft.recurring && draft.recurrenceId !== null
	);

	// Filled from the draft each time the dialog opens.
	$effect(() => {
		if (!open) return;
		const end = draft.allDay ? draft.end - day : draft.end;
		form = {
			calendarId: draft.calendarId,
			summary: draft.summary,
			location: draft.location,
			description: draft.description,
			startDate: dateValue(draft.start),
			startTime: timeValue(draft.start),
			endDate: dateValue(end),
			endTime: timeValue(draft.end),
			allDay: draft.allDay,
			reminder: draft.reminder === null ? '' : String(draft.reminder)
		};
		scope = 'only';
		error = undefined;
	});

	function input() {
		const start = fromInputs(form.startDate, form.allDay ? '00:00' : form.startTime);
		const end = form.allDay
			? fromInputs(form.endDate) + day
			: fromInputs(form.endDate, form.endTime);
		return {
			summary: form.summary.trim(),
			location: form.location.trim() || undefined,
			description: form.description.trim() || undefined,
			start,
			end,
			allDay: form.allDay,
			reminder: form.reminder === '' ? null : Number(form.reminder)
		};
	}

	// A reminder set elsewhere (e.g. 10 minutes) stays choosable.
	const choices = $derived(
		draft.reminder === null || reminderChoices.some((c) => c.minutes === draft.reminder)
			? reminderChoices
			: [
					...reminderChoices,
					{ minutes: draft.reminder, label: `${draft.reminder} Minuten vorher` }
				].sort((a, b) => a.minutes - b.minutes)
	);

	async function save() {
		const api = velo();
		if (!api) return;
		const event = input();
		if (event.end < event.start) {
			error = 'Das Ende liegt vor dem Beginn.';
			return;
		}
		busy = true;
		error = undefined;
		try {
			if (draft.id === undefined) await api.calendar.createEvent(form.calendarId, event);
			else
				await api.calendar.updateEvent(
					draft.id,
					event,
					occurrence
						? { start: draft.start, recurrenceId: draft.recurrenceId!, only: scope === 'only' }
						: undefined
				);
			open = false;
		} catch (cause) {
			error = ipcErrorMessage(cause);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (draft.id === undefined) return;
		busy = true;
		try {
			await velo()?.calendar.deleteEvent(
				draft.id,
				occurrence && scope === 'only' ? draft.recurrenceId! : undefined
			);
			open = false;
		} catch (cause) {
			error = ipcErrorMessage(cause);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="font-heading">
				{draft.id === undefined ? 'Neuer Termin' : 'Termin bearbeiten'}
			</Dialog.Title>
			{#if draft.recurring}
				<Dialog.Description class="flex items-center gap-1.5">
					<Repeat class="size-3.5" aria-hidden="true" />
					Wiederholender Termin
				</Dialog.Description>
			{/if}
		</Dialog.Header>
		<form
			class="flex flex-col gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			{#if occurrence}
				<div
					role="radiogroup"
					aria-label="Änderungen gelten für"
					class="grid grid-cols-2 rounded-lg bg-muted p-0.5"
				>
					{#each [{ value: 'only', label: 'Nur diesen Termin' }, { value: 'all', label: 'Alle Termine' }] as const as choice (choice.value)}
						<button
							type="button"
							role="radio"
							aria-checked={scope === choice.value}
							class="rounded-md px-2.5 py-1 text-xs text-muted-foreground aria-checked:bg-card aria-checked:font-medium aria-checked:text-foreground aria-checked:shadow-sm"
							onclick={() => (scope = choice.value)}
						>
							{choice.label}
						</button>
					{/each}
				</div>
			{/if}
			<Field.Field>
				<Field.Label for="event-summary">Titel</Field.Label>
				<Input id="event-summary" bind:value={form.summary} placeholder="Ohne Titel" />
			</Field.Field>
			<Field.Field orientation="horizontal">
				<Field.Label for="event-all-day">Ganztägig</Field.Label>
				<Switch id="event-all-day" bind:checked={form.allDay} />
			</Field.Field>
			<div class="grid grid-cols-2 gap-2">
				<Field.Field>
					<Field.Label for="event-start-date">Beginn</Field.Label>
					<Input id="event-start-date" type="date" bind:value={form.startDate} required />
				</Field.Field>
				{#if !form.allDay}
					<Field.Field>
						<Field.Label for="event-start-time">Uhrzeit</Field.Label>
						<Input id="event-start-time" type="time" bind:value={form.startTime} required />
					</Field.Field>
				{/if}
				<Field.Field>
					<Field.Label for="event-end-date">Ende</Field.Label>
					<Input id="event-end-date" type="date" bind:value={form.endDate} required />
				</Field.Field>
				{#if !form.allDay}
					<Field.Field>
						<Field.Label for="event-end-time">Uhrzeit</Field.Label>
						<Input id="event-end-time" type="time" bind:value={form.endTime} required />
					</Field.Field>
				{/if}
			</div>
			<Field.Field>
				<Field.Label for="event-reminder">Erinnerung</Field.Label>
				<NativeSelect.Root id="event-reminder" class="w-full" bind:value={form.reminder}>
					<NativeSelect.Option value="">Keine</NativeSelect.Option>
					{#each choices as choice (choice.minutes)}
						<NativeSelect.Option value={String(choice.minutes)}>{choice.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label for="event-location">Ort</Field.Label>
				<Input id="event-location" bind:value={form.location} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="event-description">Beschreibung</Field.Label>
				<Textarea id="event-description" rows={3} bind:value={form.description} />
			</Field.Field>
			{#if draft.id === undefined && calendars.length > 1}
				<Field.Field>
					<Field.Label for="event-calendar">Kalender</Field.Label>
					<NativeSelect.Root id="event-calendar" class="w-full" bind:value={form.calendarId}>
						{#each calendars as calendar (calendar.id)}
							<NativeSelect.Option value={calendar.id}>{calendar.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			{#if error}
				<p role="alert" class="text-sm text-destructive">{error}</p>
			{/if}
			<Dialog.Footer class="gap-2 sm:justify-between">
				{#if draft.id !== undefined}
					<Button
						variant="ghost"
						class="text-destructive hover:text-destructive"
						disabled={busy}
						onclick={remove}
					>
						Löschen
					</Button>
				{:else}
					<span></span>
				{/if}
				<div class="flex gap-2">
					<Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
					<Button type="submit" disabled={busy}>Speichern</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
