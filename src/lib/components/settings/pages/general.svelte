<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { Language } from '#lib/api.ts';
	import { applyLanguage } from '#lib/language.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import SettingRow from '../setting-row.svelte';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	/** Saved for the main process, then the page reloads in the new language. */
	async function chooseLanguage(language: Language) {
		await settings.set({ language });
		applyLanguage(language);
	}
</script>

<SettingsPage title={m.settings_general()}>
	<SettingSection title={m.settings_section_basics()}>
		<SettingRow
			label={m.settings_language()}
			for="setting-language"
			description={m.settings_language_hint()}
		>
			<NativeSelect.Root
				id="setting-language"
				class="w-40"
				value={settings.value.language}
				onchange={(event) => chooseLanguage(event.currentTarget.value as Language)}
			>
				<NativeSelect.Option value="system">{m.theme_system()}</NativeSelect.Option>
				<NativeSelect.Option value="en">English</NativeSelect.Option>
				<NativeSelect.Option value="de">Deutsch</NativeSelect.Option>
			</NativeSelect.Root>
		</SettingRow>
		<SettingRow label={m.settings_tray()} for="setting-tray" description={m.settings_tray_hint()}>
			<Switch
				id="setting-tray"
				checked={settings.value.tray}
				onCheckedChange={(checked) => settings.set({ tray: checked })}
			/>
		</SettingRow>
	</SettingSection>
</SettingsPage>
