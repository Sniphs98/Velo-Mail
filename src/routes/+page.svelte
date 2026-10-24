<script lang="ts">
	import { MailOpen } from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { mail } from '#lib/mail.svelte.ts';
	import AddAccountDialog from '#lib/components/add-account-dialog.svelte';
	import MessageList from '#lib/components/message-list.svelte';
	import ReadingPane from '#lib/components/reading-pane.svelte';
	import Sidebar from '#lib/components/sidebar.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';

	let addingAccount = $state(false);

	$effect(() => mail.connect());

	const mailbox = $derived.by(() => {
		const view = mail.view;
		return 'mailboxId' in view ? mail.mailboxes.find((m) => m.id === view.mailboxId) : undefined;
	});
	const mailboxAccount = $derived(accounts.list.find((a) => a.id === mailbox?.accountId));

	/** j/k or arrows: next/previous conversation, u: unread, Ctrl/Cmd+K: search. */
	function shortcut(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
			return;
		}
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		const actions: Record<string, () => void> = {
			j: () => mail.move(1),
			ArrowDown: () => mail.move(1),
			k: () => mail.move(-1),
			ArrowUp: () => mail.move(-1),
			u: () => mail.markUnread()
		};
		const action = actions[event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}
</script>

<svelte:window onkeydown={shortcut} />

<div class="flex h-full gap-3 p-3">
	<Sidebar onaddaccount={() => (addingAccount = true)} />

	<MessageList
		title={mailbox?.name ?? 'Alle Posteingänge'}
		subtitle={mailboxAccount?.email}
		messages={mail.messages}
		accounts={accounts.list}
		selectedId={mail.selectedId}
		showAccount={!mailbox && accounts.list.length > 1}
		onselect={(id) => mail.open(id)}
	/>

	<article
		aria-label="Nachricht"
		class="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border bg-card p-6 text-center"
		class:justify-start={mail.thread.length > 0}
	>
		{#if mail.thread.length > 0}
			{#key mail.selectedId}
				<ReadingPane
					thread={mail.thread}
					account={accounts.list.length > 1
						? accounts.list.find((a) => a.id === mail.thread[0]?.accountId)
						: undefined}
				/>
			{/key}
		{:else}
			<MailOpen class="size-10 text-muted-foreground/40" aria-hidden="true" />
			{#if accounts.list.length === 0}
				<h2 class="font-heading text-lg font-semibold">Willkommen bei Velo Mail</h2>
				<p class="max-w-sm text-sm text-muted-foreground">
					Füge ein E-Mail-Konto hinzu, um deine Nachrichten hier zu lesen.
				</p>
				<Button class="mt-2" onclick={() => (addingAccount = true)}>Konto hinzufügen</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Keine Nachricht ausgewählt</p>
			{/if}
		{/if}
	</article>
</div>

<AddAccountDialog bind:open={addingAccount} />
