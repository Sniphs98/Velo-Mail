<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { CircleAlert } from '@lucide/svelte';
	import { connectionMessages, ipcErrorMessage, rejectedLogin } from '#lib/account-messages.ts';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { velo, type ServerSettings } from '#lib/api.ts';
	import * as Alert from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as Field from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const empty = (): ServerSettings => ({
		imapHost: '',
		imapPort: 993,
		imapSecurity: 'tls',
		smtpHost: '',
		smtpPort: 465,
		smtpSecurity: 'tls',
		username: ''
	});

	let step = $state<'login' | 'servers'>('login');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let settings = $state(empty());
	let busy = $state<string>();
	let errors = $state<string[]>([]);
	let appPasswordHint = $state(false);
	let keyring = $state(true);

	function reset() {
		step = 'login';
		name = email = password = '';
		settings = empty();
		busy = undefined;
		errors = [];
		appPasswordHint = false;
	}

	// Start empty every time the dialog opens.
	$effect(() => {
		if (!open) return;
		reset();
		velo()
			?.app.info()
			.then((info) => (keyring = info.keyring));
	});

	async function save() {
		const api = velo();
		if (!api) return;
		errors = [];
		appPasswordHint = false;
		try {
			if (step === 'login') {
				busy = m.account_discovering();
				settings = (await api.accounts.discover(email.trim())).settings;
			}
			busy = m.account_checking();
			const result = await api.accounts.add({
				name: name.trim() || email.trim(),
				email: email.trim(),
				password,
				settings: $state.snapshot(settings)
			});
			if (result.ok) {
				await accounts.load();
				open = false;
			} else if (result.reason === 'exists') {
				errors = [m.account_exists()];
			} else if (result.connection) {
				errors = connectionMessages(result.connection);
				appPasswordHint = rejectedLogin(result.connection);
				// Let the user check what was found or guessed.
				step = 'servers';
			}
		} catch (error) {
			errors = [ipcErrorMessage(error)];
		} finally {
			busy = undefined;
		}
	}

	function enterManually() {
		settings = { ...empty(), username: email.trim() };
		errors = [];
		step = 'servers';
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="font-heading">{m.account_add()}</Dialog.Title>
			<Dialog.Description>
				{#if step === 'login'}
					{m.account_auto_hint()}
				{:else}
					{m.account_manual_hint()}
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="grid gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			<Field.Group class="gap-3">
				<Field.Field>
					<Field.Label for="account-name">{m.account_name()}</Field.Label>
					<Input id="account-name" bind:value={name} placeholder={m.account_name_placeholder()} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="account-email">{m.account_email()}</Field.Label>
					<Input id="account-email" type="email" required autocomplete="email" bind:value={email} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="account-password">{m.account_password()}</Field.Label>
					<Input
						id="account-password"
						type="password"
						required
						autocomplete="current-password"
						bind:value={password}
					/>
					{#if !keyring}
						<Field.Description>
							{m.account_no_keyring()}
						</Field.Description>
					{/if}
				</Field.Field>

				{#if step === 'servers'}
					<Field.Field>
						<Field.Label for="account-username">{m.account_username()}</Field.Label>
						<Input id="account-username" required bind:value={settings.username} />
					</Field.Field>
					{@render server('imap', m.server_incoming())}
					{@render server('smtp', m.server_outgoing())}
				{/if}
			</Field.Group>

			{#if errors.length > 0}
				<Alert.Root variant="destructive">
					<CircleAlert />
					<Alert.Title>{m.account_failed()}</Alert.Title>
					<Alert.Description>
						{#each errors as error (error)}
							<p>{error}</p>
						{/each}
						{#if appPasswordHint}
							<p>
								{m.account_app_password()}
							</p>
						{/if}
					</Alert.Description>
				</Alert.Root>
			{/if}

			<Dialog.Footer class="items-center gap-2 sm:justify-between">
				{#if step === 'login'}
					<Button variant="link" class="px-0" disabled={!!busy} onclick={enterManually}>
						{m.account_manual()}
					</Button>
				{:else}
					<span></span>
				{/if}
				<Button type="submit" disabled={!!busy}>
					{#if busy}
						<Spinner />
						{busy}
					{:else}
						{step === 'login' ? m.next() : m.save()}
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

{#snippet server(kind: 'imap' | 'smtp', label: string)}
	<Field.Set class="gap-2">
		<Field.Legend variant="label">{label}</Field.Legend>
		<div class="grid grid-cols-[1fr_5rem_8rem] gap-2">
			<Input
				aria-label={m.server_host({ label })}
				placeholder={m.server_host_placeholder({ kind })}
				required
				bind:value={settings[`${kind}Host`]}
			/>
			<Input
				aria-label={m.server_port({ label })}
				type="number"
				min="1"
				max="65535"
				required
				bind:value={settings[`${kind}Port`]}
			/>
			<NativeSelect.Root
				aria-label={m.server_security({ label })}
				class="w-full"
				bind:value={settings[`${kind}Security`]}
			>
				<NativeSelect.Option value="tls">SSL/TLS</NativeSelect.Option>
				<NativeSelect.Option value="starttls">STARTTLS</NativeSelect.Option>
				<NativeSelect.Option value="none">{m.server_security_none()}</NativeSelect.Option>
			</NativeSelect.Root>
		</div>
	</Field.Set>
{/snippet}
