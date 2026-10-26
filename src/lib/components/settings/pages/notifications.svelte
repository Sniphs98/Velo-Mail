<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import NotifySelect from '../notify-select.svelte';
	import SettingRow from '../setting-row.svelte';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	let error = $state<string>();
</script>

<SettingsPage title={m.settings_notifications()}>
	<SettingSection title={m.settings_section_desktop()}>
		<SettingRow
			label={m.settings_notifications()}
			for="setting-notifications"
			description={m.settings_notifications_hint()}
		>
			<Switch
				id="setting-notifications"
				checked={settings.value.notifications}
				onCheckedChange={(checked) => settings.set({ notifications: checked })}
			/>
		</SettingRow>
		<SettingRow
			label={m.settings_reminders()}
			for="setting-reminders"
			description={m.settings_reminders_hint()}
		>
			<Switch
				id="setting-reminders"
				checked={settings.value.reminders}
				onCheckedChange={(checked) => settings.set({ reminders: checked })}
			/>
		</SettingRow>
	</SettingSection>

	{#if accounts.list.length > 0}
		<SettingSection title={m.settings_notify_per_account()} description={m.account_notify_hint()}>
			{#each accounts.list as account (account.id)}
				<div class="flex items-center gap-3 py-3">
					<span class="size-2.5 shrink-0 rounded-full" style:background={account.color}></span>
					<label for="notify-{account.id}" class="min-w-0 flex-1 truncate text-sm font-medium"
						>{account.email}</label
					>
					<NotifySelect
						id="notify-{account.id}"
						{account}
						class="w-52"
						onerror={(e) => (error = e)}
					/>
				</div>
			{/each}
		</SettingSection>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
</SettingsPage>
