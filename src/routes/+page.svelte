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
</script>

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
		class:justify-start={mail.selected}
	>
		{#if mail.selected}
			<ReadingPane
				message={mail.selected}
				account={accounts.list.length > 1
					? accounts.list.find((a) => a.id === mail.selected?.accountId)
					: undefined}
			/>
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
