<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { velo } from '#lib/api.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { update } from '#lib/update.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import SettingRow from '../setting-row.svelte';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	let status = $state<string>();
	let version = $state<string>();

	$effect(() => {
		velo()
			?.app.info()
			.then((info) => (version = info.version));
	});

	async function checkNow() {
		status = m.update_searching();
		const found = await update.check();
		status = found ? m.update_found({ version: found.version }) : m.update_none();
	}
</script>

<SettingsPage title={m.settings_about()}>
	<SettingSection title={m.settings_updates()}>
		<SettingRow
			label={m.settings_updates()}
			for="setting-updates"
			description={m.settings_updates_hint()}
		>
			{#snippet hint()}
				{#if status}<span role="status" class="block pt-1">{status}</span>{/if}
			{/snippet}
			<div class="flex items-center gap-3">
				<Button variant="outline" size="sm" onclick={checkNow}>{m.update_check_now()}</Button>
				<Switch
					id="setting-updates"
					checked={settings.value.updates}
					onCheckedChange={(checked) => settings.set({ updates: checked })}
				/>
			</div>
		</SettingRow>
	</SettingSection>

	{#if version}
		<SettingSection title={m.settings_about_app()}>
			<div class="flex items-center justify-between py-3 text-sm">
				<span class="font-medium">{m.settings_version()}</span>
				<span class="text-muted-foreground tabular-nums">{version}</span>
			</div>
		</SettingSection>
	{/if}
</SettingsPage>
