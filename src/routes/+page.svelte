<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { MailOpen } from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { mail } from '#lib/mail.svelte.ts';
	import { compose } from '#lib/compose.svelte.ts';
	import AddAccountDialog from '#lib/components/add-account-dialog.svelte';
	import Composer from '#lib/components/composer.svelte';
	import MessageList from '#lib/components/message-list.svelte';
	import ReadingPane from '#lib/components/reading-pane.svelte';
	import SettingsDialog from '#lib/components/settings-dialog.svelte';
	import TidyDialog from '#lib/components/tidy-dialog.svelte';
	import ResizeHandle from '#lib/components/resize-handle.svelte';
	import Sidebar from '#lib/components/sidebar.svelte';
	import AddCalendarDialog from '#lib/components/calendar/add-calendar-dialog.svelte';
	import CalendarView from '#lib/components/calendar/calendar-view.svelte';
	import { calendar, mode } from '#lib/calendar.svelte.ts';
	import { layout, listWidth, sidebarWidth } from '#lib/layout.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { velo } from '#lib/api.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { update } from '#lib/update.svelte.ts';

	let addingAccount = $state(false);
	let showSettings = $state(false);
	let addingCalendar = $state(false);
	/** Tidying up newsletters, in these accounts (empty: all). */
	let tidying = $state(false);
	let tidyAccounts = $state<number[]>([]);

	function tidy(accountIds: number[]) {
		tidyAccounts = accountIds;
		tidying = true;
	}
	let calendarView = $state<ReturnType<typeof CalendarView>>();

	$effect(() => calendar.connect());

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
	$effect(() =>
		velo()?.mail.onOpen((id) => {
			mode.current = 'mail';
			mail.open(id);
		})
	);
	$effect(() =>
		velo()?.calendar.onShowDay((day) => {
			mode.current = 'calendar';
			calendar.show('day', new Date(day));
		})
	);
	$effect(() =>
		velo()?.mail.onCompose(() => {
			mode.current = 'mail';
			if (accounts.list[0]) compose.start(accounts.list[0].id);
		})
	);

	const mailbox = $derived.by(() => {
		const view = mail.view;
		return 'mailboxId' in view
			? mail.mailboxes.find((box) => box.id === view.mailboxId)
			: undefined;
	});
	const mailboxAccount = $derived(accounts.list.find((a) => a.id === mailbox?.accountId));

	/** "12 results in all accounts", "… in Work", "… in 2 accounts". */
	const hits = $derived.by(() => {
		const chosen = accounts.list.filter((a) => mail.filters.accounts.includes(a.id));
		const where =
			chosen.length === 0 || chosen.length === accounts.list.length
				? m.search_in_all_accounts()
				: chosen.length === 1
					? chosen[0].name
					: m.search_in_accounts({ count: chosen.length });
		const count = mail.messages.length;
		return count === 1 ? m.search_hit({ where }) : m.search_hits({ count, where });
	});

	function reply(kind: 'reply' | 'replyAll' | 'forward') {
		const latest = mail.thread.at(-1);
		if (latest) compose.start(latest.accountId, { kind, messageId: latest.id });
	}

	/** t: today, arrows: back/forward, d/w/m: day/week/month, n: new event. */
	function calendarShortcut(event: KeyboardEvent) {
		const actions: Record<string, () => void> = {
			t: () => calendar.today(),
			ArrowLeft: () => calendar.move(-1),
			ArrowRight: () => calendar.move(1),
			d: () => calendar.show('day'),
			w: () => calendar.show('week'),
			m: () => calendar.show('month'),
			n: () => calendar.calendars.length > 0 && calendarView?.create()
		};
		const action = actions[event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}

	/** From the open folder's account, else the first. */
	function newMessage() {
		if (accounts.list[0]) compose.start(mailbox?.accountId ?? accounts.list[0].id);
	}

	/**
	 * Drafts open in the composer, everything else in the reading pane; a
	 * message being written is kept as a draft first.
	 */
	async function select(id: number) {
		if (mailbox?.role === 'drafts') return compose.edit(id);
		if (compose.open) await compose.close();
		mail.open(id);
	}

	/**
	 * j/k or arrows: next/previous, u: unread, Shift+I: all read, r/a/f: reply/all/forward,
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
		// The list shortcuts would act on a conversation hidden behind the composer.
		if (compose.open && mode.current === 'mail') return;
		if (mode.current === 'calendar') {
			calendarShortcut(event);
			return;
		}
		const actions: Record<string, () => void> = {
			j: () => mail.move(1),
			ArrowDown: () => mail.move(1),
			k: () => mail.move(-1),
			ArrowUp: () => mail.move(-1),
			u: () => mail.markUnread(),
			I: () => mail.listedUnread > 0 && mail.markAllRead(),
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
			onaddcalendar={() => (addingCalendar = true)}
			onsettings={() => (showSettings = true)}
			ontidy={(accountId) => tidy([accountId])}
		/>
		<ResizeHandle bind:value={layout.sidebar} {...sidebarWidth} label={m.sidebar_width()} />

		{#if mode.current === 'calendar'}
			<CalendarView bind:this={calendarView} onaddcalendar={() => (addingCalendar = true)} />
		{:else}
			<MessageList
				width={layout.list}
				title={mail.searching ? m.search_title() : (mailbox?.name ?? m.all_inboxes())}
				subtitle={mail.searching ? hits : mailboxAccount?.email}
				messages={mail.messages}
				accounts={accounts.list}
				selectedId={mail.selectedId}
				showAccount={(!mailbox || mail.searching) && accounts.list.length > 1}
				onselect={select}
				query={mail.query}
				onsearch={(query) => mail.search(query)}
				filters={mail.filters}
				onfilter={(filters) => mail.filter(filters)}
				onsearchserver={() => mail.searchServer()}
				oncompose={accounts.list.length > 0 ? newMessage : undefined}
				tab={mail.tabbed ? mail.tab : undefined}
				tabUnread={mail.tabUnread}
				ontab={(tab) => mail.showTab(tab)}
				ontidy={() => tidy(mailbox ? [mailbox.accountId] : [])}
				unread={mail.listedUnread}
				onmarkallread={() => mail.markAllRead()}
			/>
			<ResizeHandle bind:value={layout.list} {...listWidth} label={m.list_width()} />

			<article
				aria-label={m.reading_pane()}
				class="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-xl border bg-card p-4 text-center"
				class:justify-start={mail.thread.length > 0 || compose.open}
			>
				{#if compose.open}
					<Composer />
				{:else if mail.thread.length > 0}
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
						<h2 class="font-heading text-lg font-semibold">{m.welcome_title()}</h2>
						<p class="max-w-sm text-sm text-muted-foreground">
							{m.welcome_text()}
						</p>
						<Button class="mt-2" onclick={() => (addingAccount = true)}>{m.account_add()}</Button>
					{:else}
						<p class="text-sm text-muted-foreground">{m.no_message_selected()}</p>
					{/if}
				{/if}
			</article>
		{/if}
	</div>
</div>

<AddAccountDialog bind:open={addingAccount} />
<SettingsDialog bind:open={showSettings} />
<AddCalendarDialog bind:open={addingCalendar} />
<TidyDialog bind:open={tidying} accountIds={tidyAccounts} />
