<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Plus } from '@lucide/svelte';
	import { velo, type CalendarSource } from '#lib/api.ts';
	import { calendar } from '#lib/calendar.svelte.ts';
	import { colorName } from '#lib/color-names.ts';
	import { accountColors } from '#lib/colors.ts';
	import { dialogs } from '#lib/dialogs.svelte.ts';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	let removing = $state<CalendarSource>();
	let confirming = $state(false);

	$effect(() => {
		calendar.load();
	});
</script>

<SettingsPage title={m.settings_calendars()} description={m.calendar_add_hint()}>
	{#each calendar.sources as source (source.id)}
		<SettingSection title={source.name}>
			{#snippet actions()}
				<Button
					variant="ghost"
					size="sm"
					class="text-destructive hover:text-destructive"
					onclick={() => {
						removing = source;
						confirming = true;
					}}
				>
					{m.calendar_remove()}
				</Button>
			{/snippet}
			{#each calendar.calendars.filter((c) => c.sourceId === source.id) as item (item.id)}
				<div class="flex items-center gap-4 py-3">
					<label for="calendar-{item.id}" class="min-w-0 flex-1 truncate text-sm font-medium"
						>{item.name}</label
					>
					<div
						role="radiogroup"
						aria-label={m.settings_calendar_color({ name: item.name })}
						class="flex gap-1.5"
					>
						{#each accountColors as color (color)}
							<button
								type="button"
								role="radio"
								aria-checked={item.color === color}
								aria-label={colorName(color)}
								class="size-4 rounded-full ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-foreground"
								style:background={color}
								onclick={() => velo()?.calendar.updateCalendar(item.id, { color })}
							></button>
						{/each}
					</div>
					<Switch
						id="calendar-{item.id}"
						checked={item.enabled}
						onCheckedChange={() => calendar.toggle(item)}
					/>
				</div>
			{/each}
		</SettingSection>
	{:else}
		<p class="text-sm text-muted-foreground">{m.calendar_none()}</p>
	{/each}
	<div>
		<Button variant="outline" size="sm" onclick={() => (dialogs.addCalendar = true)}>
			<Plus />
			{m.calendar_add()}
		</Button>
	</div>

	{#if removing}
		{@const source = removing}
		<ConfirmDialog
			bind:open={confirming}
			title={m.settings_calendar_remove_title({ name: source.name })}
			description={m.settings_calendar_remove_hint()}
			confirm={m.calendar_remove()}
			onconfirm={() => velo()?.calendar.removeSource(source.id)}
		/>
	{/if}
</SettingsPage>
