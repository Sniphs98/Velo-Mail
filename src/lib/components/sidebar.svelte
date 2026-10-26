<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import {
		Archive,
		CalendarDays,
		ChevronDown,
		CircleAlert,
		Ellipsis,
		File,
		Folder,
		Inbox,
		Mails,
		Pin,
		PinOff,
		Plus,
		Send,
		Settings2,
		ShieldAlert,
		Trash2
	} from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { velo, type AppInfo, type MailboxRole } from '#lib/api.ts';
	import { mail } from '#lib/mail.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { sidebar } from '#lib/sidebar.svelte.ts';
	import { mode } from '#lib/calendar.svelte.ts';
	import CalendarList from './calendar/calendar-list.svelte';
	import UpdateNotice from './update-notice.svelte';

	let {
		width,
		onaddaccount,
		onaddcalendar,
		onsettings
	}: {
		width?: number;
		onaddaccount: () => void;
		onaddcalendar: () => void;
		onsettings: () => void;
	} = $props();

	let info = $state<AppInfo>();

	$effect(() => {
		velo()
			?.app.info()
			.then((result) => (info = result));
		accounts.load();
	});

	const icons: Record<MailboxRole, typeof Inbox> = {
		inbox: Inbox,
		sent: Send,
		drafts: File,
		archive: Archive,
		trash: Trash2,
		junk: ShieldAlert,
		all: Mails
	};

	const itemClass = 'h-8 justify-start gap-2 font-normal aria-[current=page]:font-medium';
</script>

<nav
	aria-label={m.sidebar_label()}
	class="relative flex w-52 shrink-0 flex-col gap-px overflow-y-auto rounded-xl border bg-card p-2"
	style:width={width ? `${width}px` : undefined}
>
	<div
		role="tablist"
		aria-label={m.sidebar_area()}
		class="mb-2 grid shrink-0 grid-cols-2 rounded-lg bg-muted p-0.5"
	>
		<button
			type="button"
			role="tab"
			aria-selected={mode.current === 'mail'}
			class="flex items-center justify-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground aria-selected:bg-card aria-selected:font-medium aria-selected:text-foreground aria-selected:shadow-sm"
			onclick={() => (mode.current = 'mail')}
		>
			<Mails class="size-3.5" aria-hidden="true" />
			{m.sidebar_mail()}
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={mode.current === 'calendar'}
			class="flex items-center justify-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground aria-selected:bg-card aria-selected:font-medium aria-selected:text-foreground aria-selected:shadow-sm"
			onclick={() => (mode.current = 'calendar')}
		>
			<CalendarDays class="size-3.5" aria-hidden="true" />
			{m.sidebar_calendar()}
		</button>
	</div>

	{#if mode.current === 'calendar'}
		<CalendarList />
	{:else}
		<Button
			variant={mail.isShowing({ inboxes: true }) ? 'secondary' : 'ghost'}
			aria-current={mail.isShowing({ inboxes: true }) ? 'page' : undefined}
			size="sm"
			class={itemClass}
			onclick={() => mail.show({ inboxes: true })}
		>
			<Inbox class="size-4" aria-hidden="true" />
			<span class="flex-1 text-left">{m.all_inboxes()}</span>
			{#if mail.unreadInboxes > 0}
				<span class="text-xs font-semibold">{mail.unreadInboxes}</span>
			{/if}
		</Button>

		{#each accounts.list as account (account.id)}
			{@const status = mail.status[account.id]}
			{@const collapsed = sidebar.isCollapsed(account.id)}
			<section aria-label={account.name} class="flex flex-col gap-0.5">
				<div class="group/account flex items-center gap-1 pt-3 pr-0.5 pb-0.5">
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pl-0.5 text-left"
						aria-expanded={!collapsed}
						aria-label={collapsed
							? m.sidebar_expand({ name: account.name })
							: m.sidebar_collapse({ name: account.name })}
						onclick={() => sidebar.toggle(account.id)}
					>
						<ChevronDown
							class="size-3.5 shrink-0 text-muted-foreground transition-transform {collapsed
								? '-rotate-90'
								: ''}"
							aria-hidden="true"
						/>
						<span
							class="size-2.5 shrink-0 rounded-full"
							style:background={account.color}
						></span>
						<span class="flex min-w-0 flex-1 flex-col pl-0.5">
							<span class="truncate text-[13px] font-semibold">{account.name}</span>
							<!-- Shimmers while a sync takes longer than a moment. -->
							<span
								class="truncate text-xs text-muted-foreground"
								class:syncing={status?.state === 'syncing'}>{account.email}</span
							>
						</span>
					</button>
					{#if status?.state === 'syncing'}
						<span class="sr-only" role="status">{m.sidebar_syncing()}</span>
					{:else if status?.state === 'error'}
						<span title={status.error} class="text-destructive">
							<CircleAlert class="size-4" aria-label={m.sidebar_sync_failed()} />
						</span>
					{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									class="opacity-0 group-hover/account:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
									aria-label={m.sidebar_account_options({ name: account.name })}
								>
									<Ellipsis />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => velo()?.mail.sync(account.id)}>
								{m.sidebar_sync_now()}
							</DropdownMenu.Item>
							<DropdownMenu.Item variant="destructive" onclick={() => accounts.remove(account.id)}>
								{m.account_remove()}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
				{#each mail.mailboxes.filter((m) => m.accountId === account.id) as box (box.id)}
					{@const Icon = box.role ? icons[box.role] : Folder}
					{@const active = mail.isShowing({ mailboxId: box.id })}
					{@const pinned = sidebar.isPinned(box)}
					<!-- Folded, only pinned folders (and the open one) stay. -->
					{#if !collapsed || pinned || active}
						<div class="group/folder relative flex items-center">
							<Button
								variant={active ? 'secondary' : 'ghost'}
								aria-current={active ? 'page' : undefined}
								size="sm"
								class="{itemClass} flex-1 pl-6"
								onclick={() => mail.show({ mailboxId: box.id })}
							>
								<Icon class="size-4" aria-hidden="true" />
								<span class="flex-1 truncate text-left">{box.name}</span>
								{#if box.unread > 0 && box.role !== 'trash' && box.role !== 'junk'}
									<span class="text-xs font-semibold group-hover/folder:invisible"
										>{box.unread}</span
									>
								{/if}
							</Button>
							<button
								type="button"
								class="absolute right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/folder:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
								aria-label={pinned
									? m.sidebar_unpin_folder({ name: box.name })
									: m.sidebar_pin_folder({ name: box.name })}
								title={pinned ? m.sidebar_unpin() : m.sidebar_pin_hint()}
								onclick={() => sidebar.pin(box, !pinned)}
							>
								{#if pinned}<PinOff class="size-3.5" />{:else}<Pin class="size-3.5" />{/if}
							</button>
						</div>
					{/if}
				{/each}
			</section>
		{/each}
	{/if}

	<div class="min-h-4 flex-1"></div>

	<UpdateNotice />

	{#if mode.current === 'calendar'}
		<Button variant="ghost" size="sm" class="{itemClass} shrink-0" onclick={onaddcalendar}>
			<Plus class="size-4" aria-hidden="true" />
			{m.calendar_add()}
		</Button>
	{:else}
		<Button variant="ghost" size="sm" class="{itemClass} shrink-0" onclick={onaddaccount}>
			<Plus class="size-4" aria-hidden="true" />
			{m.account_add()}
		</Button>
	{/if}
	<Button variant="ghost" size="sm" class="{itemClass} shrink-0" onclick={onsettings}>
		<Settings2 class="size-4" aria-hidden="true" />
		{m.settings_title()}
	</Button>
	{#if info}
		<p class="px-2 pt-1.5 text-[11px] text-muted-foreground">{info.name} {info.version}</p>
	{/if}
</nav>

<style>
	/* A highlight sweeps across the text. Starts late, so a quick sync shows nothing at all. */
	.syncing {
		background: linear-gradient(
				90deg,
				transparent 35%,
				var(--foreground) 50%,
				transparent 65%
			)
			var(--muted-foreground);
		background-size: 250% 100%;
		background-clip: text;
		color: transparent;
		animation: shimmer 1.8s linear 0.6s infinite;
		background-position: 100% 0;
	}
	@keyframes shimmer {
		to {
			background-position: 0 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.syncing {
			animation: none;
		}
	}
</style>
