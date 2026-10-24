<script lang="ts">
	import {
		Archive,
		CircleAlert,
		Ellipsis,
		File,
		Folder,
		Inbox,
		Mails,
		PenLine,
		Plus,
		Send,
		Settings2,
		ShieldAlert,
		Trash2
	} from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { velo, type AppInfo, type MailboxRole } from '#lib/api.ts';
	import { compose } from '#lib/compose.svelte.ts';
	import { mail } from '#lib/mail.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';

	let { onaddaccount, onsettings }: { onaddaccount: () => void; onsettings: () => void } = $props();

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

	/** The account of the open folder, else the first one. */
	function defaultAccount() {
		const view = mail.view;
		const box =
			'mailboxId' in view ? mail.mailboxes.find((m) => m.id === view.mailboxId) : undefined;
		return box?.accountId ?? accounts.list[0].id;
	}

	const itemClass = 'h-9 justify-start gap-2.5 font-normal aria-[current=page]:font-medium';
</script>

<nav
	aria-label="Konten und Ordner"
	class="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-2xl border bg-card p-3.5"
>
	<Button
		disabled={accounts.list.length === 0}
		size="lg"
		class="mb-3 h-11 shrink-0 rounded-xl"
		onclick={() => compose.start(defaultAccount())}
	>
		<PenLine aria-hidden="true" />
		Neue Nachricht
	</Button>

	<Button
		variant={mail.isShowing({ inboxes: true }) ? 'secondary' : 'ghost'}
		aria-current={mail.isShowing({ inboxes: true }) ? 'page' : undefined}
		size="lg"
		class="{itemClass} h-10"
		onclick={() => mail.show({ inboxes: true })}
	>
		<Inbox class="size-[18px]" aria-hidden="true" />
		<span class="flex-1 text-left">Alle Posteingänge</span>
		{#if mail.unreadInboxes > 0}
			<span class="text-xs font-semibold">{mail.unreadInboxes}</span>
		{/if}
	</Button>

	{#each accounts.list as account (account.id)}
		{@const status = mail.status[account.id]}
		<section aria-label={account.name} class="flex flex-col gap-0.5">
			<div class="flex items-center gap-2.5 pt-4 pr-0.5 pb-1 pl-2.5">
				<span class="size-2.5 shrink-0 rounded-full" style:background={account.color}></span>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-[13px] font-semibold">{account.name}</span>
					<span class="truncate text-xs text-muted-foreground">{account.email}</span>
				</span>
				{#if status?.state === 'syncing'}
					<Spinner class="size-3.5 text-muted-foreground" aria-label="Wird synchronisiert" />
				{:else if status?.state === 'error'}
					<span title={status.error} class="text-destructive">
						<CircleAlert class="size-4" aria-label="Synchronisierung fehlgeschlagen" />
					</span>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Optionen für {account.name}"
							>
								<Ellipsis />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => velo()?.mail.sync(account.id)}>
							Jetzt synchronisieren
						</DropdownMenu.Item>
						<DropdownMenu.Item variant="destructive" onclick={() => accounts.remove(account.id)}>
							Konto entfernen
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
			{#each mail.mailboxes.filter((m) => m.accountId === account.id) as box (box.id)}
				{@const Icon = box.role ? icons[box.role] : Folder}
				{@const active = mail.isShowing({ mailboxId: box.id })}
				<Button
					variant={active ? 'secondary' : 'ghost'}
					aria-current={active ? 'page' : undefined}
					size="lg"
					class="{itemClass} pl-7"
					onclick={() => mail.show({ mailboxId: box.id })}
				>
					<Icon class="size-4" aria-hidden="true" />
					<span class="flex-1 truncate text-left">{box.name}</span>
					{#if box.unread > 0 && box.role !== 'trash' && box.role !== 'junk'}
						<span class="text-xs font-semibold">{box.unread}</span>
					{/if}
				</Button>
			{/each}
		</section>
	{/each}

	<div class="min-h-4 flex-1"></div>

	<Button
		variant="ghost"
		size="lg"
		class="h-10 shrink-0 justify-start gap-2.5 font-normal"
		onclick={onaddaccount}
	>
		<Plus class="size-[18px]" aria-hidden="true" />
		Konto hinzufügen
	</Button>
	<Button
		variant="ghost"
		size="lg"
		class="h-10 shrink-0 justify-start gap-2.5 font-normal"
		onclick={onsettings}
	>
		<Settings2 class="size-[18px]" aria-hidden="true" />
		Einstellungen
	</Button>
	{#if info}
		<p class="px-2.5 pt-2 text-xs text-muted-foreground">{info.name} {info.version}</p>
	{/if}
</nav>
