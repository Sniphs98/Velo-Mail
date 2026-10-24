<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { accounts } from '#lib/accounts.svelte.ts';
	import type { Account, Theme } from '#lib/api.ts';
	import { pictures } from '#lib/pictures.svelte.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as Field from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Switch } from '#lib/components/ui/switch/index.ts';
	import * as Tabs from '#lib/components/ui/tabs/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
		{ value: 'system', label: 'System', icon: Monitor },
		{ value: 'light', label: 'Hell', icon: Sun },
		{ value: 'dark', label: 'Dunkel', icon: Moon }
	];

	/** What is being edited per account, until it is saved. */
	let edits = $state<Record<number, { name: string; signature: string }>>({});
	let saved = $state<number>();
	let error = $state<string>();

	$effect(() => {
		if (!open) return;
		settings.load();
		edits = Object.fromEntries(
			accounts.list.map((a) => [a.id, { name: a.name, signature: a.signature }])
		);
		saved = undefined;
		error = undefined;
	});

	const changed = (account: Account) =>
		edits[account.id] &&
		(edits[account.id].name !== account.name || edits[account.id].signature !== account.signature);

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
			<Dialog.Title class="font-heading">Einstellungen</Dialog.Title>
		</Dialog.Header>

		<Tabs.Root value="general">
			<Tabs.List class="w-full">
				<Tabs.Trigger value="general">Allgemein</Tabs.Trigger>
				<Tabs.Trigger value="accounts">Konten</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="general" class="pt-4">
				<Field.Group class="gap-5">
					<Field.Set class="gap-2">
						<Field.Legend variant="label">Design</Field.Legend>
						<div role="radiogroup" aria-label="Design" class="grid grid-cols-3 gap-2">
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
							<Field.Label for="setting-notifications">Benachrichtigungen</Field.Label>
							<Field.Description>
								Zeigt neue Mails im Posteingang an, während Velo Mail im Hintergrund ist.
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
							<Field.Label for="setting-avatars">Absenderbilder</Field.Label>
							<Field.Description>
								Firmenlogos und Gravatar-Fotos. Dafür fragt Velo Mail die Domain des Absenders bzw.
								Gravatar an.
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
							<Field.Label for="setting-tray">Im Hintergrund weiterlaufen</Field.Label>
							<Field.Description>
								Mit Symbol in der Taskleiste: Nach dem Schließen des Fensters kommen neue Mails
								weiter an.
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
							<Field.Field>
								<Field.Label for="account-{account.id}-name">Name</Field.Label>
								<Input
									id="account-{account.id}-name"
									bind:value={edits[account.id].name}
									oninput={() => (saved = undefined)}
								/>
								<Field.Description>So sehen Empfänger dich als Absender.</Field.Description>
							</Field.Field>
							<Field.Field>
								<Field.Label for="account-{account.id}-signature">Signatur</Field.Label>
								<Textarea
									id="account-{account.id}-signature"
									rows={3}
									placeholder="Viele Grüße"
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
									Konto entfernen
								</Button>
								<div class="flex items-center gap-3">
									{#if saved === account.id}
										<span role="status" class="text-sm text-muted-foreground">Gespeichert</span>
									{/if}
									<Button
										size="sm"
										disabled={!changed(account) || !edits[account.id].name.trim()}
										onclick={() => save(account)}
									>
										Speichern
									</Button>
								</div>
							</div>
						</section>
					{/if}
				{:else}
					<p class="text-sm text-muted-foreground">Noch kein Konto eingerichtet.</p>
				{/each}
				{#if error}
					<p role="alert" class="text-sm text-destructive">{error}</p>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
