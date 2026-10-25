<script lang="ts">
	import { Paperclip, PenLine, Search, X } from '@lucide/svelte';
	import type { Account, MessageSummary } from '#lib/api.ts';
	import { listDate } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';
	import SenderAvatar from './sender-avatar.svelte';

	let {
		width,
		title,
		subtitle,
		messages,
		accounts,
		selectedId,
		showAccount,
		onselect,
		query = '',
		onsearch = () => {},
		onsearchserver,
		oncompose
	}: {
		/** In pixels; set by the divider next to it. */
		width?: number;
		title: string;
		subtitle?: string;
		messages: MessageSummary[];
		accounts: Account[];
		selectedId: number | null;
		/** Marks each message with its account's color (combined inboxes). */
		showAccount: boolean;
		onselect: (id: number) => void;
		/** The search shown in the field; results are in `messages`. */
		query?: string;
		onsearch?: (query: string) => void;
		/** Searches the servers for older messages; resolves with how many. */
		onsearchserver?: () => Promise<number>;
		/** Starts a new message; the button is hidden without it. */
		oncompose?: () => void;
	} = $props();

	let typed = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let serverResult = $state<'searching' | number>();

	// Follows a reset from outside (e.g. opening a folder).
	$effect(() => {
		if (query === '') typed = '';
	});
	$effect(() => {
		void query;
		serverResult = undefined;
	});

	function input(value: string) {
		typed = value;
		clearTimeout(timer);
		timer = setTimeout(() => onsearch(value), 200);
	}

	async function searchServer() {
		if (!onsearchserver) return;
		serverResult = 'searching';
		serverResult = await onsearchserver();
	}

	const colors = $derived(new Map(accounts.map((a) => [a.id, a.color])));
</script>

<section
	aria-label="Nachrichtenliste"
	class="flex w-80 shrink-0 flex-col gap-2 rounded-xl border bg-card p-2.5"
	style:width={width ? `${width}px` : undefined}
>
	<div class="flex items-start gap-2 pl-1">
		<div class="flex min-w-0 flex-1 flex-col">
			<h1 class="truncate font-heading text-base font-semibold">{title}</h1>
			{#if subtitle}
				<span class="truncate text-xs text-muted-foreground">{subtitle}</span>
			{/if}
		</div>
		{#if oncompose}
			<Button
				size="icon-sm"
				aria-label="Neue Nachricht (C)"
				title="Neue Nachricht (C)"
				onclick={oncompose}
			>
				<PenLine />
			</Button>
		{/if}
	</div>
	<div class="relative">
		<Search
			class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
			aria-hidden="true"
		/>
		<Input
			type="search"
			placeholder="Suchen"
			aria-label="Suchen"
			class="h-8 rounded-lg border-transparent bg-muted pr-9 pl-8 text-sm"
			value={typed}
			oninput={(event) => input(event.currentTarget.value)}
			onkeydown={(event) => {
				if (event.key === 'Escape') {
					input('');
					event.currentTarget.blur();
				}
			}}
		/>
		{#if typed}
			<Button
				variant="ghost"
				size="icon-xs"
				class="absolute top-1/2 right-1 -translate-y-1/2"
				aria-label="Suche löschen"
				onclick={() => input('')}
			>
				<X />
			</Button>
		{/if}
	</div>

	{#if messages.length === 0}
		<p class="py-10 text-center text-sm text-muted-foreground">
			{query ? 'Keine Treffer' : 'Keine E-Mails'}
		</p>
	{:else}
		<!-- relative: keeps the sr-only labels inside the scrolling list, not below the page. -->
		<ul class="relative -mx-1 flex flex-col gap-px overflow-y-auto px-1">
			{#each messages as message (message.id)}
				<li>
					<button
						type="button"
						aria-current={message.id === selectedId ? 'true' : undefined}
						class="flex w-full gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60 aria-[current=true]:bg-muted"
						onclick={() => onselect(message.id)}
					>
						<SenderAvatar
							name={message.fromName}
							address={message.fromAddress}
							size={32}
							badge={showAccount ? colors.get(message.accountId) : undefined}
						/>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="flex items-center justify-between gap-2">
								<span class="flex min-w-0 items-center gap-1.5">
									<span class="truncate text-sm" class:font-semibold={!message.seen}>
										{message.fromName || message.fromAddress || 'Unbekannt'}
									</span>
									{#if message.threadSize > 1}
										<span class="text-xs text-muted-foreground">
											{message.threadSize} <span class="sr-only">Nachrichten</span>
										</span>
									{/if}
								</span>
								<span class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
									{#if message.hasAttachments}
										<Paperclip class="size-3.5" aria-hidden="true" />
										<span class="sr-only">Mit Anhang</span>
									{/if}
									{listDate(message.date)}
									{#if !message.seen}
										<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
										<span class="sr-only">Ungelesen</span>
									{/if}
								</span>
							</span>
							<span class="truncate text-xs" class:font-semibold={!message.seen}>
								{message.subject || '(Kein Betreff)'}
							</span>
							{#if message.snippet}
								<span class="truncate text-xs text-muted-foreground">{message.snippet}</span>
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if query && onsearchserver}
		<div
			class="mt-auto flex items-center justify-center gap-2 pt-2 text-[13px] text-muted-foreground"
		>
			{#if serverResult === 'searching'}
				<Spinner /> Suche auf dem Server …
			{:else if serverResult !== undefined}
				<span role="status">
					{serverResult === 0
						? 'Auf dem Server nichts Älteres gefunden'
						: `${serverResult} ältere ${serverResult === 1 ? 'Nachricht' : 'Nachrichten'} vom Server geholt`}
				</span>
			{:else}
				<Button variant="outline" size="sm" onclick={searchServer}>
					Auf dem Server weitersuchen
				</Button>
			{/if}
		</div>
	{/if}
</section>
