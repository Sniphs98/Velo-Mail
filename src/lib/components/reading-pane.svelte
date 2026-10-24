<script lang="ts">
	import type { Account, MessageSummary } from '#lib/api.ts';
	import { fullDate } from '#lib/format.ts';
	import SenderAvatar from './sender-avatar.svelte';

	let { message, account }: { message: MessageSummary; account?: Account } = $props();

	const recipients = $derived(message.to.map((r) => r.name || r.address).join(', '));
</script>

<div class="flex w-full flex-col gap-5 self-stretch text-left">
	<h2 class="font-heading text-[22px] leading-tight font-semibold">
		{message.subject || '(Kein Betreff)'}
	</h2>
	<div class="flex flex-wrap items-center gap-3">
		<SenderAvatar name={message.fromName} address={message.fromAddress} size={44} />
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="text-sm font-semibold">
				{message.fromName || message.fromAddress}
				{#if message.fromName && message.fromAddress}
					<span class="font-normal text-muted-foreground">&lt;{message.fromAddress}&gt;</span>
				{/if}
			</span>
			<span class="text-[13px] text-muted-foreground">
				an {recipients || 'unbekannt'} · {fullDate(message.date)}
			</span>
		</div>
		{#if account}
			<span
				class="flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground"
			>
				<span class="size-2 rounded-full" style:background={account.color}></span>
				{account.name}
			</span>
		{/if}
	</div>
	<p class="text-sm text-muted-foreground">
		Der Inhalt der Nachricht wird im nächsten Schritt geladen.
	</p>
</div>
