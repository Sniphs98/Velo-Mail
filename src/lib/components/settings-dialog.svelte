<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { accountColors } from '#lib/colors.ts';
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { accounts } from '#lib/accounts.svelte.ts';
	import type { Account, Language, Theme } from '#lib/api.ts';
	import { applyLanguage } from '#lib/language.ts';
	import { pictures } from '#lib/pictures.svelte.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { update } from '#lib/update.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as Field from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import * as Tabs from '#lib/components/ui/tabs/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
		{ value: 'system', label: m.theme_system(), icon: Monitor },
		{ value: 'light', label: m.theme_light(), icon: Sun },
		{ value: 'dark', label: m.theme_dark(), icon: Moon }
	];

	/** What is being edited per account, until it is saved. */
	let edits = $state<Record<number, { name: string; signature: string }>>({});
	let saved = $state<number>();
	let updateStatus = $state<string>();

	async function checkNow() {
		updateStatus = m.update_searching();
		const found = await update.check();
		updateStatus = found ? m.update_found({ version: found.version }) : m.update_none();
	}
	let error = $state<string>();

	/** Saved for the main process, then the page reloads in the new language. */
	async function chooseLanguage(language: Language) {
		await settings.set({ language });
		applyLanguage(language);
	}

	$effect(() => {
		if (!open) return;
		settings.load();
		edits = Object.fromEntries(
			accounts.list.map((a) => [a.id, { name: a.name, signature: a.signature }])
		);
		saved = undefined;
		error = undefined;
		updateStatus = undefined;
	});

	const changed = (account: Account) =>
		edits[account.id] &&
		(edits[account.id].name !== account.name || edits[account.id].signature !== account.signature);

	const colorNames: Record<string, string> = {
		'#ea580c': m.color_orange(),
		'#0d9488': m.color_teal(),
		'#7c3aed': m.color_violet(),
		'#db2777': m.color_pink(),
		'#ca8a04': m.color_mustard(),
		'#16a34a': m.color_green(),
		'#2563eb': m.color_blue(),
		'#525252': m.color_grey()
	};

	async function setColor(account: Account, color: string) {
		error = undefined;
		try {
			await accounts.update(account.id, { color });
		} catch (cause) {
			error = ipcErrorMessage(cause);
		}
	}

	async function save(account: Account) {
		error = undefined;
		try {
			await accounts.update(account.id, $state.snapshot(edits[account.id]));
			saved = account.id;
		} catch (cause) {
			error = ipcErrorMessage(cause);
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="font-heading">{m.settings_title()}</Dialog.Title>
		</Dialog.Header>

		<Tabs.Root value="general">
			<Tabs.List class="w-full">
				<Tabs.Trigger value="general">{m.settings_general()}</Tabs.Trigger>
				<Tabs.Trigger value="accounts">{m.filter_accounts()}</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="general" class="pt-4">
				<Field.Group class="gap-5">
					<Field.Set class="gap-2">
						<Field.Legend variant="label">{m.settings_theme()}</Field.Legend>
						<div role="radiogroup" aria-label={m.settings_theme()} class="grid grid-cols-3 gap-2">
							{#each themes as theme (theme.value)}
								{@const active = settings.value.theme === theme.value}
								<button
									type="button"
									role="radio"
									aria-checked={active}
									class="flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm transition-colors hover:bg-muted aria-checked:border-primary aria-checked:bg-muted aria-checked:font-medium"
									onclick={() => settings.set({ theme: theme.value })}
								>
									<theme.icon class="size-5" aria-hidden="true" />
									{theme.label}
								</button>
							{/each}
						</div>
					</Field.Set>

					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="setting-language">{m.settings_language()}</Field.Label>
							<Field.Description>{m.settings_language_hint()}</Field.Description>
						</Field.Content>
						<NativeSelect.Root
							id="setting-language"
							class="w-36"
							value={settings.value.language}
							onchange={(event) => chooseLanguage(event.currentTarget.value as Language)}
						>
							<NativeSelect.Option value="system">{m.theme_system()}</NativeSelect.Option>
							<NativeSelect.Option value="en">English</NativeSelect.Option>
							<NativeSelect.Option value="de">Deutsch</NativeSelect.Option>
						</NativeSelect.Root>
					</Field.Field>

					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="setting-notifications">{m.settings_notifications()}</Field.Label>
							<Field.Description>
								{m.settings_notifications_hint()}
							</Field.Description>
						</Field.Content>
						<Switch
							id="setting-notifications"
							checked={settings.value.notifications}
							onCheckedChange={(checked) => settings.set({ notifications: checked })}
						/>
					</Field.Field>

					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="setting-reminders">{m.settings_reminders()}</Field.Label>
							<Field.Description>
								{m.settings_reminders_hint()}
							</Field.Description>
						</Field.Content>
						<Switch
							id="setting-reminders"
							checked={settings.value.reminders}
							onCheckedChange={(checked) => settings.set({ reminders: checked })}
						/>
					</Field.Field>

					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="setting-avatars">{m.settings_avatars()}</Field.Label>
							<Field.Description>
								{m.settings_avatars_hint()}
							</Field.Description>
						</Field.Content>
						<Switch
							id="setting-avatars"
							checked={settings.value.avatars}
							onCheckedChange={async (checked) => {
								await settings.set({ avatars: checked });
								pictures.clear();
							}}
						/>
					</Field.Field>

					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="setting-updates">{m.settings_updates()}</Field.Label>
							<Field.Description>
								{m.settings_updates_hint()}
								{#if updateStatus}<span role="status" class="block pt-1">{updateStatus}</span>{/if}
							</Field.Description>
						</Field.Content>
						<div class="flex items-center gap-2">
							<Button variant="outline" size="xs" onclick={checkNow}>{m.update_check_now()}</Button>
							<Switch
								id="setting-updates"
								checked={settings.value.updates}
								onCheckedChange={(checked) => settings.set({ updates: checked })}
							/>
						</div>
					</Field.Field>

					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="setting-tray">{m.settings_tray()}</Field.Label>
							<Field.Description>
								{m.settings_tray_hint()}
							</Field.Description>
						</Field.Content>
						<Switch
							id="setting-tray"
							checked={settings.value.tray}
							onCheckedChange={(checked) => settings.set({ tray: checked })}
						/>
					</Field.Field>
				</Field.Group>
			</Tabs.Content>

			<Tabs.Content value="accounts" class="flex flex-col gap-4 pt-4">
				{#each accounts.list as account (account.id)}
					{#if edits[account.id]}
						<section aria-label={account.email} class="flex flex-col gap-3 rounded-xl border p-4">
							<div class="flex items-center gap-2.5">
								<span class="size-2.5 rounded-full" style:background={account.color}></span>
								<span class="truncate text-sm font-semibold">{account.email}</span>
							</div>
							<div class="flex flex-col gap-2">
								<span id="account-{account.id}-color" class="text-sm font-medium"
									>{m.account_color()}</span
								>
								<div
									role="radiogroup"
									aria-labelledby="account-{account.id}-color"
									class="flex flex-wrap gap-2"
								>
									{#each accountColors as color (color)}
										<button
											type="button"
											role="radio"
											aria-checked={account.color === color}
											aria-label={colorNames[color] ?? color}
											class="size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow aria-checked:ring-2 aria-checked:ring-foreground"
											style:background={color}
											onclick={() => setColor(account, color)}
										></button>
									{/each}
								</div>
								<Field.Description>
									{m.account_color_hint()}
								</Field.Description>
							</div>
							<Field.Field>
								<Field.Label for="account-{account.id}-name">{m.account_name()}</Field.Label>
								<Input
									id="account-{account.id}-name"
									bind:value={edits[account.id].name}
									oninput={() => (saved = undefined)}
								/>
								<Field.Description>{m.account_name_hint()}</Field.Description>
							</Field.Field>
							<Field.Field>
								<Field.Label for="account-{account.id}-signature"
									>{m.account_signature()}</Field.Label
								>
								<Textarea
									id="account-{account.id}-signature"
									rows={3}
									placeholder={m.account_signature_placeholder()}
									bind:value={edits[account.id].signature}
									oninput={() => (saved = undefined)}
								/>
							</Field.Field>
							<div class="flex items-center justify-between gap-2">
								<Button
									variant="ghost"
									size="sm"
									class="text-destructive hover:text-destructive"
									onclick={() => accounts.remove(account.id)}
								>
									{m.account_remove()}
								</Button>
								<div class="flex items-center gap-3">
									{#if saved === account.id}
										<span role="status" class="text-sm text-muted-foreground">{m.saved()}</span>
									{/if}
									<Button
										size="sm"
										disabled={!changed(account) || !edits[account.id].name.trim()}
										onclick={() => save(account)}
									>
										{m.save()}
									</Button>
								</div>
							</div>
						</section>
					{/if}
				{:else}
					<p class="text-sm text-muted-foreground">{m.account_none()}</p>
				{/each}
				{#if error}
					<p role="alert" class="text-sm text-destructive">{error}</p>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
