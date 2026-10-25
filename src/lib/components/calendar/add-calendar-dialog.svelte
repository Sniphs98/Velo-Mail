<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { velo } from '#lib/api.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as Field from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let name = $state('');
	let username = $state('');
	let password = $state('');
	let serverUrl = $state('');
	let error = $state<string>();
	let busy = $state(false);

	$effect(() => {
		if (!open) return;
		name = username = password = serverUrl = '';
		error = undefined;
	});

	const reasons = {
		auth: m.calendar_error_auth(),
		notfound: m.calendar_error_notfound(),
		oauth: m.calendar_error_oauth()
	};

	async function add() {
		busy = true;
		error = undefined;
		try {
			const result = await velo()?.calendar.addSource({
				name: name.trim() || undefined,
				username: username.trim(),
				password,
				serverUrl: serverUrl.trim() || undefined
			});
			if (result?.ok) open = false;
			else if (result) error = reasons[result.reason];
		} catch (cause) {
			error = ipcErrorMessage(cause);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="font-heading">{m.calendar_add()}</Dialog.Title>
			<Dialog.Description>
				{m.calendar_add_hint()}
			</Dialog.Description>
		</Dialog.Header>
		<form
			class="flex flex-col gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				add();
			}}
		>
			<Field.Field>
				<Field.Label for="calendar-username">{m.calendar_username()}</Field.Label>
				<Input id="calendar-username" bind:value={username} autocomplete="username" required />
			</Field.Field>
			<Field.Field>
				<Field.Label for="calendar-password">{m.account_password()}</Field.Label>
				<Input
					id="calendar-password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="calendar-server">{m.calendar_server()}</Field.Label>
				<Input
					id="calendar-server"
					bind:value={serverUrl}
					placeholder={m.calendar_server_placeholder()}
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="calendar-name">{m.calendar_name()}</Field.Label>
				<Input id="calendar-name" bind:value={name} placeholder={m.calendar_name_placeholder()} />
			</Field.Field>
			{#if error}
				<p role="alert" class="text-sm text-destructive">{error}</p>
			{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
				<Button type="submit" disabled={busy || !username.trim() || !password}>
					{#if busy}<Spinner /> {m.connecting()}{:else}{m.add()}{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
