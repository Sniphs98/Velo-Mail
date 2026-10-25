<script lang="ts">
	import { CalendarDays, Check, CircleHelp, X } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import {
		velo,
		type Calendar,
		type Invitation,
		type InvitationResponse,
		type ParticipantStatus
	} from '#lib/api.ts';
	import { eventTime } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';

	let { messageId }: { messageId: number } = $props();

	let invitation = $state<Invitation | null>(null);
	let calendars = $state<Calendar[]>([]);
	let calendarId = $state<number>();
	let busy = $state(false);
	let error = $state<string>();

	async function load(id: number) {
		const api = velo();
		if (!api) return;
		try {
			const [found, list] = await Promise.all([api.mail.invitation(id), api.calendar.calendars()]);
			if (id !== messageId) return;
			invitation = found;
			calendars = list;
			calendarId ??= found?.calendarId ?? list.find((c) => c.enabled)?.id ?? list[0]?.id;
		} catch (e) {
			if (id === messageId) error = ipcErrorMessage(e);
		}
	}

	// Only another message loads again, not the same one handed over anew (mail-body.svelte).
	const message = $derived(messageId);

	$effect(() => {
		const id = message;
		invitation = null;
		error = undefined;
		calendarId = undefined;
		load(id);
		// The answer can also change in the calendar, e.g. after a sync.
		return velo()?.calendar.onChanged(() => load(id));
	});

	const answers: { value: InvitationResponse; label: string; icon: typeof Check }[] = [
		{ value: 'accepted', label: 'Zusagen', icon: Check },
		{ value: 'tentative', label: 'Vielleicht', icon: CircleHelp },
		{ value: 'declined', label: 'Absagen', icon: X }
	];

	const given: Record<InvitationResponse, string> = {
		accepted: 'Du hast zugesagt.',
		tentative: 'Du hast mit Vielleicht geantwortet.',
		declined: 'Du hast abgesagt.'
	};

	const replied: Partial<Record<ParticipantStatus, string>> = {
		accepted: 'hat zugesagt',
		tentative: 'hat mit Vielleicht geantwortet',
		declined: 'hat abgesagt',
		delegated: 'hat die Einladung weitergegeben'
	};

	const organizer = $derived(
		invitation?.organizer ? invitation.organizer.name || invitation.organizer.address : null
	);

	async function run(action: () => Promise<void> | undefined) {
		busy = true;
		error = undefined;
		try {
			await action();
			await load(messageId);
		} catch (e) {
			error = ipcErrorMessage(e);
		} finally {
			busy = false;
		}
	}

	const respond = (response: InvitationResponse) =>
		run(() => velo()?.mail.respondToInvitation(messageId, response, calendarId ?? null));

	const remove = () => run(() => velo()?.mail.removeCancelledEvent(messageId));
</script>

{#if invitation && invitation.method !== 'other'}
	{@const answer = invitation.attendees.find((a) => a.status !== 'needs-action')}
	<section
		aria-label={invitation.method === 'cancel' ? 'Absage' : 'Einladung'}
		class="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3"
	>
		<div class="flex gap-3">
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border"
			>
				<CalendarDays class="size-4.5" aria-hidden="true" />
			</span>
			<div class="flex min-w-0 flex-col gap-0.5">
				<p class="font-semibold" class:line-through={invitation.method === 'cancel'}>
					{invitation.summary || '(Ohne Titel)'}
				</p>
				<p class="text-sm text-muted-foreground">
					{eventTime(invitation.start, invitation.end, invitation.allDay)}{invitation.recurring
						? ' · wiederholt sich'
						: ''}
				</p>
				{#if invitation.location}
					<p class="truncate text-sm text-muted-foreground">{invitation.location}</p>
				{/if}
				{#if organizer && invitation.method !== 'reply'}
					<p class="text-xs text-muted-foreground">
						Von {organizer}{invitation.attendees.length > 1
							? ` · ${invitation.attendees.length} Teilnehmende`
							: ''}
					</p>
				{/if}
			</div>
		</div>

		{#if invitation.method === 'cancel'}
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<span class="flex-1 text-muted-foreground">
					Dieser Termin wurde abgesagt.{invitation.inCalendar
						? ''
						: ' Er steht nicht in deinem Kalender.'}
				</span>
				{#if invitation.inCalendar}
					<Button size="sm" variant="outline" disabled={busy} onclick={remove}>
						Aus dem Kalender entfernen
					</Button>
				{/if}
			</div>
		{:else if invitation.method === 'reply'}
			{#if answer}
				<p class="text-sm text-muted-foreground">
					{answer.name || answer.address}
					{replied[answer.status] ?? 'hat geantwortet'}.
				</p>
			{/if}
		{:else if invitation.outdated}
			<p class="text-sm text-muted-foreground">
				Diese Einladung ist veraltet: In deinem Kalender steht schon eine neuere Version.
			</p>
		{:else}
			<div class="flex flex-wrap items-center gap-2">
				<div role="group" aria-label="Antwort" class="flex gap-1.5">
					{#each answers as { value, label, icon: Icon } (value)}
						<Button
							size="sm"
							variant={invitation.response === value ? 'default' : 'outline'}
							aria-pressed={invitation.response === value}
							disabled={busy}
							onclick={() => respond(value)}
						>
							<Icon aria-hidden="true" />
							{label}
						</Button>
					{/each}
				</div>
				{#if calendars.length > 1 && !invitation.inCalendar}
					<NativeSelect.Root
						aria-label="Kalender"
						size="sm"
						class="max-w-48"
						bind:value={calendarId}
						disabled={busy}
					>
						{#each calendars as calendar (calendar.id)}
							<NativeSelect.Option value={calendar.id}>{calendar.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				{/if}
			</div>
			<p role="status" class="text-xs text-muted-foreground">
				{#if invitation.response}
					{given[invitation.response]}
				{/if}
				{#if calendars.length === 0}
					Kein Kalender verbunden – {organizer
						? `deine Antwort geht nur per Mail an ${organizer}.`
						: 'der Termin wird nirgends eingetragen.'}
				{/if}
			</p>
		{/if}
		{#if error}
			<p role="alert" class="text-sm text-destructive">{error}</p>
		{/if}
	</section>
{/if}
