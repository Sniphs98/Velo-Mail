<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import type { Theme } from '#lib/api.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import SettingsPage from '../settings-page.svelte';

	const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
		{ value: 'system', label: m.theme_system(), icon: Monitor },
		{ value: 'light', label: m.theme_light(), icon: Sun },
		{ value: 'dark', label: m.theme_dark(), icon: Moon }
	];
</script>

<SettingsPage title={m.settings_appearance()}>
	<section class="flex flex-col gap-2">
		<h3 id="setting-theme" class="text-sm font-semibold">{m.settings_theme()}</h3>
		<div role="radiogroup" aria-labelledby="setting-theme" class="grid grid-cols-3 gap-3">
			{#each themes as theme (theme.value)}
				<button
					type="button"
					role="radio"
					aria-checked={settings.value.theme === theme.value}
					class="flex flex-col items-center gap-2 rounded-xl border bg-card py-6 text-sm transition-colors hover:bg-muted aria-checked:border-primary aria-checked:bg-muted aria-checked:font-medium"
					onclick={() => settings.set({ theme: theme.value })}
				>
					<theme.icon class="size-6" aria-hidden="true" />
					{theme.label}
				</button>
			{/each}
		</div>
	</section>
</SettingsPage>
