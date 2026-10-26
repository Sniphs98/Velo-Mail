<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Paperclip, PenLine, Search, SlidersHorizontal, Sparkles, X } from '@lucide/svelte';
	import type { Account, InboxTab, MessageSummary, SearchFilters } from '#lib/api.ts';
	import { activeFilters, noFilters } from '#lib/search.ts';
	import { listDate } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';
	import SearchFiltersPanel from './search-filters.svelte';
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
		filters = noFilters,
		onfilter = () => {},
		onsearchserver,
		oncompose,
		tab,
		tabUnread,
		ontab,
		ontidy
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
		/** Narrows the search by account, sender, time, attachments, unread. */
		filters?: SearchFilters;
		onfilter?: (filters: SearchFilters) => void;
		/** Searches the servers for older messages; resolves with how many. */
		onsearchserver?: () => Promise<number>;
		/** Starts a new message; the button is hidden without it. */
		oncompose?: () => void;
		/** The inbox tab shown; no tabs without it (other folders, searching). */
		tab?: InboxTab;
		tabUnread?: Record<InboxTab, number>;
		ontab?: (tab: InboxTab) => void;
		/** Opens tidying up newsletters by sender; offered in the newsletter tab. */
		ontidy?: () => void;
	} = $props();

	const tabs: { value: InboxTab; label: () => string }[] = [
		{ value: 'primary', label: m.tab_primary },
		{ value: 'newsletters', label: m.tab_newsletters }
	];

	let typed = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let serverResult = $state<'searching' | number>();
	let showFilters = $state(false);

	const filterCount = $derived(activeFilters(filters));
	const searching = $derived(Boolean(query.trim()) || filterCount > 0);
	// The server knows words, senders, days and unread; not "has attachments".
	const serverSearchable = $derived(
		Boolean(query.trim() || filters.from.trim()) ||
			filters.since !== null ||
			filters.until !== null ||
			filters.unread
	);

	// Follows a reset from outside (e.g. opening a folder).
	$effect(() => {
		if (query === '') typed = '';
	});
	$effect(() => {
		void query;
		void filters;
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
	aria-label={m.list_label()}
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
				aria-label={m.compose_new_shortcut()}
				title={m.compose_new_shortcut()}
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
			placeholder={m.search_placeholder()}
			aria-label={m.search_placeholder()}
			class="h-8 rounded-lg border-transparent bg-muted pr-16 pl-8 text-sm"
			value={typed}
			oninput={(event) => input(event.currentTarget.value)}
			onkeydown={(event) => {
				if (event.key === 'Escape') {
					input('');
					event.currentTarget.blur();
				}
			}}
		/>
		<div class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
			{#if typed}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={m.search_clear()}
					onclick={() => input('')}
				>
					<X />
				</Button>
			{/if}
			<Button
				variant="ghost"
				size="icon-xs"
				class="relative aria-expanded:bg-background"
				aria-label={m.filter_button()}
				aria-expanded={showFilters}
				title={m.filter_hint()}
				onclick={() => (showFilters = !showFilters)}
			>
				<SlidersHorizontal />
				{#if filterCount > 0}
					<span
						class="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground"
					>
						{filterCount}<span class="sr-only"> {m.filter_active()}</span>
					</span>
				{/if}
			</Button>
		</div>
	</div>
	{#if showFilters}
		<SearchFiltersPanel {filters} {accounts} {onfilter} />
	{/if}
	{#if tab && !searching}
		<div role="tablist" aria-label={m.tab_label()} class="flex gap-1 border-b px-1">
			{#each tabs as item (item.value)}
				{@const unread = tabUnread?.[item.value] ?? 0}
				<button
					type="button"
					role="tab"
					aria-selected={tab === item.value}
					class="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-2 pb-1.5 text-xs text-muted-foreground hover:text-foreground aria-selected:border-primary aria-selected:font-medium aria-selected:text-foreground"
					onclick={() => ontab?.(item.value)}
				>
					{item.label()}
					{#if unread > 0}
						<span class="rounded-full bg-muted px-1.5 text-[10px] font-semibold">
							{unread}<span class="sr-only"> {m.unread()}</span>
						</span>
					{/if}
				</button>
			{/each}
			{#if tab === 'newsletters' && ontidy}
				<span class="flex-1"></span>
				<Button variant="ghost" size="xs" class="mb-1" onclick={ontidy}>
					<Sparkles />
					{m.tidy_open()}
				</Button>
			{/if}
		</div>
	{/if}

	{#if messages.length === 0}
		<p class="py-10 text-center text-sm text-muted-foreground">
			{searching ? m.search_no_results() : m.list_empty()}
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
										{message.fromName || message.fromAddress || m.sender_unknown()}
									</span>
									{#if message.threadSize > 1}
										<span class="text-xs text-muted-foreground">
											{message.threadSize} <span class="sr-only">{m.list_messages()}</span>
										</span>
									{/if}
								</span>
								<span class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
									{#if message.hasAttachments}
										<Paperclip class="size-3.5" aria-hidden="true" />
										<span class="sr-only">{m.with_attachment()}</span>
									{/if}
									{listDate(message.date)}
									{#if !message.seen}
										<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
										<span class="sr-only">{m.unread()}</span>
									{/if}
								</span>
							</span>
							<span class="truncate text-xs" class:font-semibold={!message.seen}>
								{message.subject || m.no_subject()}
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
	{#if searching && serverSearchable && onsearchserver}
		<div
			class="mt-auto flex items-center justify-center gap-2 pt-2 text-[13px] text-muted-foreground"
		>
			{#if serverResult === 'searching'}
				<Spinner /> {m.search_server_running()}
			{:else if serverResult !== undefined}
				<span role="status">
					{serverResult === 0
						? m.search_server_none()
						: serverResult === 1
							? m.search_server_one()
							: m.search_server_many({ count: serverResult })}
				</span>
			{:else}
				<Button variant="outline" size="sm" onclick={searchServer}>
					{m.search_server()}
				</Button>
			{/if}
		</div>
	{/if}
</section>
