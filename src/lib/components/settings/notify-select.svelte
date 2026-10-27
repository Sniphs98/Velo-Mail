<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { accounts } from '#lib/accounts.svelte.ts';
	import type { Account, NotifyMode } from '#lib/api.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';

	let {
		id,
		account,
		label,
		class: className,
		onerror
	}: {
		id: string;
		account: Account;
		/** Unless a label element names it. */
		label?: string;
		class?: string;
		onerror: (error: string) => void;
	} = $props();

	async function choose(notify: NotifyMode) {
		try {
			await accounts.update(account.id, { notify });
		} catch (cause) {
			onerror(ipcErrorMessage(cause));
		}
	}
</script>

<NativeSelect.Root
	{id}
	aria-label={label}
	class={className}
	value={account.notify}
	onchange={(event) => choose(event.currentTarget.value as NotifyMode)}
>
	<NativeSelect.Option value="all">{m.account_notify_all()}</NativeSelect.Option>
	<NativeSelect.Option value="important">{m.account_notify_important()}</NativeSelect.Option>
	<NativeSelect.Option value="none">{m.account_notify_none()}</NativeSelect.Option>
</NativeSelect.Root>
