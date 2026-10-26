<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { velo } from '#lib/api.ts';
	import { pictures } from '#lib/pictures.svelte.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import SettingRow from '../setting-row.svelte';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	let trusted = $state<string[]>([]);

	async function load() {
		trusted = (await velo()?.mail.trustedSenders()) ?? [];
	}

	async function untrust(address: string) {
		await velo()?.mail.untrustSender(address);
		await load();
	}

	$effect(() => {
		load();
	});
</script>

<SettingsPage title={m.settings_privacy()}>
	<SettingSection title={m.settings_section_images()}>
		<SettingRow
			label={m.settings_avatars()}
			for="setting-avatars"
			description={m.settings_avatars_hint()}
		>
			<Switch
				id="setting-avatars"
				checked={settings.value.avatars}
				onCheckedChange={async (checked) => {
					await settings.set({ avatars: checked });
					pictures.clear();
				}}
			/>
		</SettingRow>
	</SettingSection>

	<SettingSection title={m.settings_trusted()} description={m.settings_trusted_hint()}>
		{#each trusted as address (address)}
			<div class="flex items-center gap-3 py-2">
				<span class="min-w-0 flex-1 truncate text-sm">{address}</span>
				<Button
					variant="ghost"
					size="sm"
					aria-label={m.settings_trusted_remove_label({ address })}
					onclick={() => untrust(address)}
				>
					{m.settings_trusted_remove()}
				</Button>
			</div>
		{:else}
			<p class="py-3 text-sm text-muted-foreground">{m.settings_trusted_none()}</p>
		{/each}
	</SettingSection>
</SettingsPage>
