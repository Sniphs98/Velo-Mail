<script lang="ts">
	import { MailOpen } from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { mail } from '#lib/mail.svelte.ts';
	import { compose } from '#lib/compose.svelte.ts';
	import AddAccountDialog from '#lib/components/add-account-dialog.svelte';
	import ComposeDialog from '#lib/components/compose-dialog.svelte';
	import MessageList from '#lib/components/message-list.svelte';
	import ReadingPane from '#lib/components/reading-pane.svelte';
	import SettingsDialog from '#lib/components/settings-dialog.svelte';
	import ResizeHandle from '#lib/components/resize-handle.svelte';
	import Sidebar from '#lib/components/sidebar.svelte';
	import { layout, listWidth, sidebarWidth } from '#lib/layout.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { velo } from '#lib/api.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { update } from '#lib/update.svelte.ts';

	let addingAccount = $state(false);
	let showSettings = $state(false);

	$effect(() => mail.connect());

	// Remembers the pane widths after each change.
	$effect(() => {
		void [layout.sidebar, layout.list];
		layout.save();
	});

	// Looks for a newer release once on start, unless switched off.
	$effect(() => {
		settings.load().then(() => {
			if (settings.value.updates) update.check();
		});
	});

	// From a notification or the tray.
	$effect(() => velo()?.mail.onOpen((id) => mail.open(id)));
	$effect(() =>
		velo()?.mail.onCompose(() => accounts.list[0] && compose.start(accounts.list[0].id))
	);

	const mailbox = $derived.by(() => {
		const view = mail.view;
		return 'mailboxId' in view ? mail.mailboxes.find((m) => m.id === view.mailboxId) : undefined;
	});
	const mailboxAccount = $derived(accounts.list.find((a) => a.id === mailbox?.accountId));

	function reply(kind: 'reply' | 'replyAll' | 'forward') {
		const latest = mail.thread.at(-1);
		if (latest) compose.start(latest.accountId, { kind, messageId: latest.id });
	}

	/** From the open folder's account, else the first. */
	function newMessage() {
		if (accounts.list[0]) compose.start(mailbox?.accountId ?? accounts.list[0].id);
	}

	/** Drafts open in the composer, everything else in the reading pane. */
	function select(id: number) {
		if (mailbox?.role === 'drafts') compose.edit(id);
		else mail.open(id);
	}

	/**
	 * j/k or arrows: next/previous, u: unread, r/a/f: reply/all/forward,
	 * c: new message, e: archive, Delete/#: trash, Ctrl/Cmd+K: search.
	 */
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
			u: () => mail.markUnread(),
			r: () => reply('reply'),
			a: () => reply('replyAll'),
			f: () => reply('forward'),
			c: newMessage,
			e: () => mail.thread.length > 0 && mail.moveOpen('archive'),
			'#': () => mail.thread.length > 0 && mail.moveOpen('trash'),
			Delete: () => mail.thread.length > 0 && mail.moveOpen('trash')
		};
		const action = actions[event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}
</script>

<svelte:window onkeydown={shortcut} />

<div class="flex h-full flex-col">
	<!-- Instead of the system title bar: room to drag the window by, and for its buttons. -->
	<header
		class="flex h-9 shrink-0 items-center justify-center text-xs font-medium text-muted-foreground select-none [-webkit-app-region:drag]"
	>
		Velo Mail
	</header>

	<div class="flex min-h-0 flex-1 px-2 pb-2">
		<Sidebar
			width={layout.sidebar}
			onaddaccount={() => (addingAccount = true)}
			onsettings={() => (showSettings = true)}
		/>
		<ResizeHandle bind:value={layout.sidebar} {...sidebarWidth} label="Breite der Seitenleiste" />

		<MessageList
			width={layout.list}
			title={mail.query.trim() ? 'Suche' : (mailbox?.name ?? 'Alle Posteingänge')}
			subtitle={mail.query.trim()
				? `${mail.messages.length} Treffer in allen Konten`
				: mailboxAccount?.email}
			messages={mail.messages}
			accounts={accounts.list}
			selectedId={mail.selectedId}
			showAccount={(!mailbox || !!mail.query.trim()) && accounts.list.length > 1}
			onselect={select}
			query={mail.query}
			onsearch={(query) => mail.search(query)}
			onsearchserver={() => mail.searchServer()}
			oncompose={accounts.list.length > 0 ? newMessage : undefined}
		/>
		<ResizeHandle bind:value={layout.list} {...listWidth} label="Breite der Nachrichtenliste" />

		<article
			aria-label="Nachricht"
			class="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-xl border bg-card p-4 text-center"
			class:justify-start={mail.thread.length > 0}
		>
			{#if mail.thread.length > 0}
				{#key mail.selectedId}
					<ReadingPane
						thread={mail.thread}
						onreply={reply}
						onmove={(to) => mail.moveOpen(to)}
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
</div>

<AddAccountDialog bind:open={addingAccount} />
<SettingsDialog bind:open={showSettings} />
<ComposeDialog />
