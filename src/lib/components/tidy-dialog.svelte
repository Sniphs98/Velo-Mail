<script lang="ts">
	import { untrack } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { Archive, ArrowDown, ArrowUp, MailMinus, Trash2 } from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { velo, type NewsletterSender } from '#lib/api.ts';
	import { listDate } from '#lib/format.ts';
	import { unsubscribeFrom, type UnsubscribeOutcome } from '#lib/unsubscribe.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';
	import SenderAvatar from './sender-avatar.svelte';

	let {
		open = $bindable(false),
		accountIds = []
	}: {
		open?: boolean;
		/** Whose newsletters; empty for all accounts. */
		accountIds?: number[];
	} = $props();

	let senders = $state<NewsletterSender[]>();
	/** What happened per sender, shown in its row. */
	let done = $state<Record<string, string>>({});
	let busy = $state<string>();
	let error = $state<string>();
	/** The accounts shown, chosen in the dialog; empty for all. */
	let shown = $state<number[]>([]);
	/** Addresses ticked for acting on all at once. */
	let selected = $state<Record<string, boolean>>({});

	type SortKey = 'name' | 'count' | 'unread' | 'latest';
	let sort = $state<{ key: SortKey; descending: boolean }>({ key: 'count', descending: true });

	const sorted = $derived.by(() => {
		const { key, descending } = sort;
		const value = (sender: NewsletterSender) =>
			key === 'name' ? (sender.name || sender.address).toLocaleLowerCase() : sender[key];
		return [...(senders ?? [])].sort((a, b) => {
			const [x, y] = descending ? [value(b), value(a)] : [value(a), value(b)];
			return x < y ? -1 : x > y ? 1 : 0;
		});
	});
	const ticked = $derived(sorted.filter((sender) => selected[sender.address]));

	function sortBy(key: SortKey) {
		sort =
			sort.key === key
				? { key, descending: !sort.descending }
				: { key, descending: key !== 'name' };
	}

	async function load() {
		senders = (await velo()?.mail.newsletterSenders($state.snapshot(shown))) ?? [];
	}

	$effect(() => {
		if (!open) return;
		const ids = [...accountIds];
		untrack(() => {
			shown = ids;
			senders = undefined;
			done = {};
			selected = {};
			error = undefined;
			load();
		});
	});

	function show(accountId: string) {
		shown = accountId ? [Number(accountId)] : [];
		senders = undefined;
		selected = {};
		load();
	}

	const unsubscribeText: Record<UnsubscribeOutcome, () => string> = {
		done: m.unsubscribe_done,
		opened: m.unsubscribe_opened,
		writing: m.unsubscribe_writing,
		none: m.unsubscribe_none
	};

	async function act(sender: NewsletterSender, action: () => Promise<string>) {
		busy = sender.address;
		error = undefined;
		try {
			done[sender.address] = await action();
		} catch (cause) {
			error = ipcErrorMessage(cause);
		} finally {
			busy = undefined;
		}
	}

	const unsubscribe = (sender: NewsletterSender) =>
		act(sender, async () => {
			const outcome = await unsubscribeFrom({ id: sender.messageId, accountId: sender.accountId });
			// The composer opens over the page; this dialog would hide it.
			if (outcome === 'writing') open = false;
			return unsubscribeText[outcome]();
		});

	const move = (sender: NewsletterSender, to: 'archive' | 'trash') =>
		act(sender, async () => {
			const count =
				(await velo()?.mail.moveFromSender(sender.address, $state.snapshot(shown), to)) ?? 0;
			await load();
			return to === 'archive' ? m.tidy_archived({ count }) : m.tidy_deleted({ count });
		});

	/** Moves the mail of every ticked sender, one after the other. */
	async function moveTicked(to: 'archive' | 'trash') {
		for (const sender of ticked) await move(sender, to);
		selected = {};
	}

	const keep = (sender: NewsletterSender) =>
		act(sender, async () => {
			await velo()?.mail.setSenderRule(sender.address, 'primary');
			await load();
			return '';
		});
</script>

<Dialog.Root bind:open>
	<Dialog.Content size="lg" class="gap-0 overflow-hidden p-0">
		<Dialog.Header class="border-b px-5 py-3.5 pr-12">
			<Dialog.Title class="font-heading">{m.tidy_title()}</Dialog.Title>
			<Dialog.Description>{m.tidy_hint()}</Dialog.Description>
		</Dialog.Header>

		<div class="flex min-h-12 items-center gap-3 border-b px-5 py-2">
			{#if accounts.list.length > 1}
				<NativeSelect.Root
					aria-label={m.tidy_account()}
					class="w-56"
					value={shown.length === 1 ? String(shown[0]) : ''}
					onchange={(event) => show(event.currentTarget.value)}
				>
					<NativeSelect.Option value="">{m.tidy_account_all()}</NativeSelect.Option>
					{#each accounts.list as account (account.id)}
						<NativeSelect.Option value={String(account.id)}>{account.email}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			{/if}
			<div class="ml-auto flex items-center gap-2">
				{#if ticked.length > 0}
					<span class="text-sm text-muted-foreground">
						{m.tidy_selected({ count: ticked.length })}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={!!busy}
						onclick={() => moveTicked('archive')}
					>
						<Archive />
						{m.tidy_bulk_archive()}
					</Button>
					<Button variant="outline" size="sm" disabled={!!busy} onclick={() => moveTicked('trash')}>
						<Trash2 />
						{m.tidy_bulk_trash()}
					</Button>
				{/if}
				{#if busy}
					<Spinner />
				{/if}
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if senders === undefined}
				<div class="flex justify-center py-8"><Spinner /></div>
			{:else if senders.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">{m.tidy_empty()}</p>
			{:else}
				<table class="w-full text-sm">
					<thead class="sticky top-0 z-10 bg-popover text-left text-xs text-muted-foreground">
						<tr class="border-b">
							<th class="w-10 py-2 pl-5">
								<input
									type="checkbox"
									class="size-3.5 cursor-pointer align-middle"
									aria-label={m.tidy_select_all()}
									checked={ticked.length === sorted.length}
									indeterminate={ticked.length > 0 && ticked.length < sorted.length}
									onchange={(event) =>
										(selected = event.currentTarget.checked
											? Object.fromEntries(sorted.map((sender) => [sender.address, true]))
											: {})}
								/>
							</th>
							{@render header('name', m.tidy_col_sender(), 'text-left')}
							{@render header('count', m.tidy_col_count(), 'w-24 text-right')}
							{@render header('unread', m.tidy_col_unread(), 'w-24 text-right')}
							{@render header('latest', m.tidy_col_latest(), 'w-32 text-right')}
							<th class="w-80 py-2 pr-5 text-right font-medium">{m.tidy_col_actions()}</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each sorted as sender (sender.address)}
							<tr
								aria-label={sender.name || sender.address}
								class="hover:bg-muted/40"
								class:bg-muted={selected[sender.address]}
							>
								<td class="py-2 pl-5">
									<input
										type="checkbox"
										class="size-3.5 cursor-pointer align-middle"
										aria-label={m.tidy_select({ name: sender.name || sender.address })}
										bind:checked={selected[sender.address]}
									/>
								</td>
								<td class="max-w-0 py-2 pr-3">
									<div class="flex items-center gap-3">
										<SenderAvatar name={sender.name} address={sender.address} size={32} />
										<span class="flex min-w-0 flex-col">
											<span class="truncate font-medium">{sender.name || sender.address}</span>
											<span class="truncate text-xs text-muted-foreground">
												{#if done[sender.address]}
													<span role="status">{done[sender.address]}</span>
												{:else if sender.name}
													{sender.address}
												{/if}
											</span>
										</span>
									</div>
								</td>
								<td class="px-3 py-2 text-right tabular-nums">{sender.count}</td>
								<td class="px-3 py-2 text-right text-muted-foreground tabular-nums">
									{sender.unread}
								</td>
								<td class="px-3 py-2 text-right text-muted-foreground tabular-nums">
									{listDate(sender.latest)}
								</td>
								<td class="py-2 pr-5">
									<div class="flex items-center justify-end gap-0.5">
										{#if sender.unsubscribe}
											<Button
												variant="outline"
												size="xs"
												disabled={!!busy}
												onclick={() => unsubscribe(sender)}
											>
												<MailMinus />
												{m.reading_unsubscribe()}
											</Button>
										{/if}
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={m.tidy_archive_all()}
											title={m.tidy_archive_all()}
											disabled={!!busy}
											onclick={() => move(sender, 'archive')}
										>
											<Archive />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={m.tidy_delete_all()}
											title={m.tidy_delete_all()}
											disabled={!!busy}
											onclick={() => move(sender, 'trash')}
										>
											<Trash2 />
										</Button>
										<Button
											variant="ghost"
											size="xs"
											title={m.sender_rule_primary()}
											disabled={!!busy}
											onclick={() => keep(sender)}
										>
											{m.tidy_keep()}
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
		{#if error}
			<p role="alert" class="border-t px-5 py-3 text-sm text-destructive">{error}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>

{#snippet header(key: SortKey, label: string, align: string)}
	<th
		class="px-3 py-2 font-medium {align}"
		aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : undefined}
	>
		<button
			type="button"
			class="inline-flex items-center gap-1 hover:text-foreground"
			onclick={() => sortBy(key)}
		>
			{label}
			{#if sort.key === key}
				{#if sort.descending}<ArrowDown class="size-3" aria-hidden="true" />{:else}<ArrowUp
						class="size-3"
						aria-hidden="true"
					/>{/if}
			{/if}
		</button>
	</th>
{/snippet}
