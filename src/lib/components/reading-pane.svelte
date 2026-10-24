<script lang="ts">
	import { Archive, Forward, Reply, ReplyAll, Trash2 } from '@lucide/svelte';
	import type { Account, MessageSummary } from '#lib/api.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { fullDate, listDate } from '#lib/format.ts';
	import MailBody from './mail-body.svelte';
	import SenderAvatar from './sender-avatar.svelte';

	let {
		thread,
		account,
		onreply,
		onmove
	}: {
		thread: MessageSummary[];
		account?: Account;
		onreply: (kind: 'reply' | 'replyAll' | 'forward') => void;
		onmove: (to: 'archive' | 'trash') => void;
	} = $props();

	/** Messages opened or closed by hand; otherwise only the newest is open. */
	let toggled = $state<Record<number, boolean>>({});
	const open = (message: MessageSummary) => toggled[message.id] ?? message.id === thread.at(-1)?.id;

	const recipients = (message: MessageSummary) =>
		message.to.map((r) => r.name || r.address).join(', ');
</script>

<div class="flex w-full flex-col gap-3 self-stretch text-left">
	<div role="toolbar" aria-label="Aktionen" class="-mt-1 flex items-center gap-0.5">
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Archivieren (E)"
			onclick={() => onmove('archive')}
		>
			<Archive />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Löschen (Entf)"
			onclick={() => onmove('trash')}
		>
			<Trash2 />
		</Button>
		<div class="flex-1"></div>
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Antworten (R)"
			onclick={() => onreply('reply')}
		>
			<Reply />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Allen antworten (A)"
			onclick={() => onreply('replyAll')}
		>
			<ReplyAll />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Weiterleiten (F)"
			onclick={() => onreply('forward')}
		>
			<Forward />
		</Button>
	</div>
	<div class="flex flex-wrap items-start gap-3">
		<h2 class="flex-1 font-heading text-lg leading-tight font-semibold">
			{thread[0]?.subject || '(Kein Betreff)'}
		</h2>
		{#if account}
			<span
				class="flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground"
			>
				<span class="size-2 rounded-full" style:background={account.color}></span>
				{account.name}
			</span>
		{/if}
	</div>

	{#each thread as message (message.id)}
		{#if open(message)}
			<article
				aria-label="Nachricht von {message.fromName || message.fromAddress}"
				class="flex flex-col gap-3 rounded-xl border p-3"
				class:border-transparent={thread.length === 1}
				class:p-0={thread.length === 1}
			>
				<button
					type="button"
					class="flex items-center gap-3 text-left disabled:cursor-default"
					disabled={thread.length === 1}
					onclick={() => (toggled[message.id] = false)}
				>
					<SenderAvatar name={message.fromName} address={message.fromAddress} size={36} />
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-semibold">
							{message.fromName || message.fromAddress}
							{#if message.fromName && message.fromAddress}
								<span class="font-normal text-muted-foreground">&lt;{message.fromAddress}&gt;</span>
							{/if}
						</span>
						<span class="text-xs text-muted-foreground">
							an {recipients(message) || 'unbekannt'} · {fullDate(message.date)}
						</span>
					</span>
				</button>
				<MailBody messageId={message.id} sender={message.fromAddress} />
			</article>
		{:else}
			<button
				type="button"
				class="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left hover:bg-muted/60"
				onclick={() => (toggled[message.id] = true)}
			>
				<SenderAvatar name={message.fromName} address={message.fromAddress} size={28} />
				<span class="w-36 shrink-0 truncate text-sm font-medium">
					{message.fromName || message.fromAddress}
				</span>
				<span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{message.snippet}</span>
				<span class="shrink-0 text-xs text-muted-foreground">{listDate(message.date)}</span>
			</button>
		{/if}
	{/each}
</div>
