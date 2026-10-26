<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Sparkles, X } from '@lucide/svelte';
	import { velo, type SenderRule } from '#lib/api.ts';
	import { dialogs } from '#lib/dialogs.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	let rules = $state<{ address: string; rule: SenderRule }[]>([]);

	async function load() {
		rules = (await velo()?.mail.senderRules()) ?? [];
	}

	async function setRule(address: string, rule: SenderRule | null) {
		await velo()?.mail.setSenderRule(address, rule);
		await load();
	}

	function tidy() {
		dialogs.settings = false;
		dialogs.showTidy();
	}

	$effect(() => {
		load();
	});
</script>

<SettingsPage title={m.settings_inbox()}>
	<SettingSection title={m.tidy_title()} description={m.tidy_hint()}>
		<div class="py-3">
			<Button variant="outline" onclick={tidy}>
				<Sparkles />
				{m.tidy_open()}
			</Button>
		</div>
	</SettingSection>

	<SettingSection
		title={m.settings_sender_rules()}
		description={m.settings_sender_rules_hint()}
		flush
	>
		{#if rules.length > 0}
			<table class="w-full text-sm">
				<thead class="text-left text-xs text-muted-foreground">
					<tr>
						<th class="px-4 py-2 font-medium">{m.settings_sender_rules_address()}</th>
						<th class="w-56 px-4 py-2 font-medium">{m.settings_sender_rules_rule()}</th>
						<th class="w-12"></th>
					</tr>
				</thead>
				<tbody class="divide-y border-t">
					{#each rules as { address, rule } (address)}
						<tr>
							<td class="max-w-0 truncate px-4 py-2">{address}</td>
							<td class="px-4 py-2">
								<NativeSelect.Root
									class="w-full"
									aria-label={m.settings_sender_rule_for({ address })}
									value={rule}
									onchange={(event) => setRule(address, event.currentTarget.value as SenderRule)}
								>
									<NativeSelect.Option value="newsletter"
										>{m.settings_sender_rule_newsletter()}</NativeSelect.Option
									>
									<NativeSelect.Option value="primary"
										>{m.settings_sender_rule_primary()}</NativeSelect.Option
									>
								</NativeSelect.Root>
							</td>
							<td class="pr-2">
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={m.settings_sender_rule_remove({ address })}
									title={m.settings_sender_rule_remove({ address })}
									onclick={() => setRule(address, null)}
								>
									<X />
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="px-4 py-3 text-sm text-muted-foreground">{m.settings_sender_rules_none()}</p>
		{/if}
	</SettingSection>
</SettingsPage>
