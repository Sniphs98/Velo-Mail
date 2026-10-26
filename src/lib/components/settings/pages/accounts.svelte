<script lang="ts">
	import { untrack } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { Plus } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { colorName } from '#lib/color-names.ts';
	import { accountColors } from '#lib/colors.ts';
	import { dialogs } from '#lib/dialogs.svelte.ts';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Field from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import NotifySelect from '../notify-select.svelte';
	import SettingSection from '../setting-section.svelte';
	import SettingsPage from '../settings-page.svelte';

	const account = $derived(
		accounts.list.find((a) => a.id === dialogs.settingsAccount) ?? accounts.list[0]
	);

	/** Name and signature as edited, until saved. */
	let name = $state('');
	let signature = $state('');
	let saved = $state(false);
	let error = $state<string>();
	let removing = $state(false);

	// Start over when another account is chosen, not when this one is saved.
	const accountId = $derived(account?.id);
	$effect(() => {
		if (accountId === undefined) return;
		untrack(() => {
			name = account.name;
			signature = account.signature;
		});
		saved = false;
		error = undefined;
	});

	const changed = $derived(!!account && (name !== account.name || signature !== account.signature));

	async function run(action: () => Promise<unknown>) {
		error = undefined;
		try {
			await action();
		} catch (cause) {
			error = ipcErrorMessage(cause);
		}
	}

	function save() {
		const id = account.id;
		return run(async () => {
			await accounts.update(id, { name, signature });
			saved = true;
		});
	}
</script>

<SettingsPage title={m.settings_accounts()} wide>
	<div class="flex min-h-0 gap-6">
		<div class="flex w-64 shrink-0 flex-col gap-1">
			<ul aria-label={m.settings_accounts()} class="flex flex-col gap-1">
				{#each accounts.list as item (item.id)}
					<li>
						<button
							type="button"
							aria-current={item.id === account?.id ? 'true' : undefined}
							class="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted aria-[current=true]:border-border aria-[current=true]:bg-muted"
							onclick={() => (dialogs.settingsAccount = item.id)}
						>
							<span class="size-2.5 shrink-0 rounded-full" style:background={item.color}></span>
							<span class="flex min-w-0 flex-col">
								<span class="truncate text-sm font-medium">{item.name}</span>
								<span class="truncate text-xs text-muted-foreground">{item.email}</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
			<Button
				variant="ghost"
				size="sm"
				class="justify-start"
				onclick={() => (dialogs.addAccount = true)}
			>
				<Plus />
				{m.account_add()}
			</Button>
		</div>

		{#if account}
			<div aria-label={account.email} role="region" class="flex min-w-0 flex-1 flex-col gap-6">
				<SettingSection title={m.settings_account_identity()}>
					<div class="grid gap-4 py-4 lg:grid-cols-2">
						<Field.Field>
							<Field.Label for="account-name">{m.account_name()}</Field.Label>
							<Input id="account-name" bind:value={name} oninput={() => (saved = false)} />
							<Field.Description>{m.account_name_hint()}</Field.Description>
						</Field.Field>
						<div class="flex flex-col gap-2">
							<span id="account-color" class="text-sm font-medium">{m.account_color()}</span>
							<div role="radiogroup" aria-labelledby="account-color" class="flex flex-wrap gap-2">
								{#each accountColors as color (color)}
									<button
										type="button"
										role="radio"
										aria-checked={account.color === color}
										aria-label={colorName(color)}
										class="size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow aria-checked:ring-2 aria-checked:ring-foreground"
										style:background={color}
										onclick={() => run(() => accounts.update(account.id, { color }))}
									></button>
								{/each}
							</div>
							<Field.Description>{m.account_color_hint()}</Field.Description>
						</div>
					</div>
				</SettingSection>

				<SettingSection title={m.account_signature()}>
					<div class="grid gap-4 py-4 lg:grid-cols-2">
						<Field.Field>
							<Field.Label for="account-signature" class="sr-only"
								>{m.account_signature()}</Field.Label
							>
							<Textarea
								id="account-signature"
								rows={6}
								placeholder={m.account_signature_placeholder()}
								bind:value={signature}
								oninput={() => (saved = false)}
							/>
						</Field.Field>
						<figure class="flex flex-col gap-1.5">
							<figcaption class="text-xs font-medium text-muted-foreground">
								{m.settings_account_preview()}
							</figcaption>
							<div
								class="min-h-full rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap text-muted-foreground"
							>
								{#if signature.trim()}-- <br />{signature}{:else}<i
										>{m.settings_account_preview_empty()}</i
									>{/if}
							</div>
						</figure>
					</div>
				</SettingSection>

				<div class="flex items-center justify-end gap-3">
					{#if saved}
						<span role="status" class="text-sm text-muted-foreground">{m.saved()}</span>
					{/if}
					<Button disabled={!changed || !name.trim()} onclick={save}>{m.save()}</Button>
				</div>

				<SettingSection title={m.account_notify()} description={m.account_notify_hint()}>
					<div class="py-3">
						<NotifySelect
							id="account-notify"
							{account}
							label={m.account_notify()}
							class="w-60"
							onerror={(message) => (error = message)}
						/>
					</div>
				</SettingSection>

				{#if error}
					<p role="alert" class="text-sm text-destructive">{error}</p>
				{/if}

				<section
					class="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 p-4"
				>
					<div class="flex flex-col gap-0.5">
						<h3 class="text-sm font-semibold">{m.account_remove()}</h3>
						<p class="text-sm text-muted-foreground">{m.settings_account_remove_hint()}</p>
					</div>
					<Button variant="destructive" onclick={() => (removing = true)}>
						{m.account_remove()}
					</Button>
				</section>

				<ConfirmDialog
					bind:open={removing}
					title={m.settings_account_remove_title({ email: account.email })}
					description={m.settings_account_remove_hint()}
					confirm={m.account_remove()}
					onconfirm={() => run(() => accounts.remove(account.id))}
				/>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.account_none()}</p>
		{/if}
	</div>
</SettingsPage>
