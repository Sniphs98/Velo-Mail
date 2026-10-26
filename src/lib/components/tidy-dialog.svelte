<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Archive, MailMinus, Trash2 } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { velo, type NewsletterSender } from '#lib/api.ts';
	import { listDate } from '#lib/format.ts';
	import { unsubscribeFrom, type UnsubscribeOutcome } from '#lib/unsubscribe.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
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

	async function load() {
		senders = (await velo()?.mail.newsletterSenders($state.snapshot(accountIds))) ?? [];
	}

	$effect(() => {
		if (!open) return;
		senders = undefined;
		done = {};
		error = undefined;
		load();
	});

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
				(await velo()?.mail.moveFromSender(sender.address, $state.snapshot(accountIds), to)) ?? 0;
			await load();
			return to === 'archive' ? m.tidy_archived({ count }) : m.tidy_deleted({ count });
		});

	const keep = (sender: NewsletterSender) =>
		act(sender, async () => {
			await velo()?.mail.setSenderRule(sender.address, 'primary');
			await load();
			return '';
		});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title class="font-heading">{m.tidy_title()}</Dialog.Title>
			<Dialog.Description>{m.tidy_hint()}</Dialog.Description>
		</Dialog.Header>

		{#if senders === undefined}
			<div class="flex justify-center py-8"><Spinner /></div>
		{:else if senders.length === 0}
			<p class="py-8 text-center text-sm text-muted-foreground">{m.tidy_empty()}</p>
		{:else}
			<ul class="flex flex-col divide-y">
				{#each senders as sender (sender.address)}
					<li aria-label={sender.name || sender.address} class="flex items-center gap-3 py-2">
						<SenderAvatar name={sender.name} address={sender.address} size={32} />
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium">{sender.name || sender.address}</span>
							<span class="truncate text-xs text-muted-foreground">
								{m.tidy_count({ count: sender.count, unread: sender.unread })} · {m.tidy_latest({
									date: listDate(sender.latest)
								})}
							</span>
							{#if done[sender.address]}
								<span role="status" class="truncate text-xs text-muted-foreground"
									>{done[sender.address]}</span
								>
							{/if}
						</span>
						{#if busy === sender.address}
							<Spinner />
						{/if}
						<div class="flex shrink-0 items-center gap-0.5">
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
					</li>
				{/each}
			</ul>
		{/if}
		{#if error}
			<p role="alert" class="text-sm text-destructive">{error}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
