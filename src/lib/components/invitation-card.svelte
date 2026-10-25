<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
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
		{ value: 'accepted', label: m.invite_accept(), icon: Check },
		{ value: 'tentative', label: m.invite_maybe(), icon: CircleHelp },
		{ value: 'declined', label: m.invite_decline(), icon: X }
	];

	const given: Record<InvitationResponse, string> = {
		accepted: m.invite_given_accepted(),
		tentative: m.invite_given_tentative(),
		declined: m.invite_given_declined()
	};

	const replied: Partial<Record<ParticipantStatus, (who: string) => string>> = {
		accepted: (who) => m.invite_replied_accepted({ who }),
		tentative: (who) => m.invite_replied_tentative({ who }),
		declined: (who) => m.invite_replied_declined({ who }),
		delegated: (who) => m.invite_replied_delegated({ who })
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
		aria-label={invitation.method === 'cancel' ? m.invite_cancellation() : m.invite_label()}
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
					{invitation.summary || m.event_untitled()}
				</p>
				<p class="text-sm text-muted-foreground">
					{eventTime(invitation.start, invitation.end, invitation.allDay)}{invitation.recurring
						? ` · ${m.invite_recurring()}`
						: ''}
				</p>
				{#if invitation.location}
					<p class="truncate text-sm text-muted-foreground">{invitation.location}</p>
				{/if}
				{#if organizer && invitation.method !== 'reply'}
					<p class="text-xs text-muted-foreground">
						{m.invite_from({ organizer })}{invitation.attendees.length > 1
							? ` · ${m.invite_attendees({ count: invitation.attendees.length })}`
							: ''}
					</p>
				{/if}
			</div>
		</div>

		{#if invitation.method === 'cancel'}
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<span class="flex-1 text-muted-foreground">
					{m.invite_cancelled()}{invitation.inCalendar ? '' : ` ${m.invite_not_in_calendar()}`}
				</span>
				{#if invitation.inCalendar}
					<Button size="sm" variant="outline" disabled={busy} onclick={remove}>
						{m.invite_remove()}
					</Button>
				{/if}
			</div>
		{:else if invitation.method === 'reply'}
			{#if answer}
				<p class="text-sm text-muted-foreground">
					{(replied[answer.status] ?? ((who: string) => m.invite_replied({ who })))(
						answer.name || answer.address
					)}
				</p>
			{/if}
		{:else if invitation.outdated}
			<p class="text-sm text-muted-foreground">
				{m.invite_outdated()}
			</p>
		{:else}
			<div class="flex flex-wrap items-center gap-2">
				<div role="group" aria-label={m.invite_answer()} class="flex gap-1.5">
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
						aria-label={m.sidebar_calendar()}
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
					{organizer ? m.invite_no_calendar_mail({ organizer }) : m.invite_no_calendar()}
				{/if}
			</p>
		{/if}
		{#if error}
			<p role="alert" class="text-sm text-destructive">{error}</p>
		{/if}
	</section>
{/if}
