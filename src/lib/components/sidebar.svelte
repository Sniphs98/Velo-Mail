<script lang="ts">
	import { Ellipsis, Inbox, PenLine, Plus, Settings2 } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { velo, type AppInfo } from '#lib/api.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';

	let { onaddaccount }: { onaddaccount: () => void } = $props();

	let info = $state<AppInfo>();

	$effect(() => {
		velo()
			?.app.info()
			.then((result) => (info = result));
		accounts.load();
	});
</script>

<nav
	aria-label="Konten und Ordner"
	class="flex w-60 shrink-0 flex-col gap-1 rounded-2xl border bg-card p-3.5"
>
	<Button disabled size="lg" class="mb-3 h-11 rounded-xl">
		<PenLine aria-hidden="true" />
		Neue Nachricht
	</Button>

	<Button
		href={resolve('/')}
		aria-current="page"
		variant="secondary"
		size="lg"
		class="h-10 justify-start gap-2.5"
	>
		<Inbox class="size-[18px]" aria-hidden="true" />
		Alle Posteingänge
	</Button>

	{#each accounts.list as account (account.id)}
		<section aria-label={account.name} class="flex items-center gap-2.5 pt-4 pr-0.5 pb-1 pl-2.5">
			<span class="size-2.5 shrink-0 rounded-full" style:background={account.color}></span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-[13px] font-semibold">{account.name}</span>
				<span class="truncate text-xs text-muted-foreground">{account.email}</span>
			</span>
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
					<DropdownMenu.Item variant="destructive" onclick={() => accounts.remove(account.id)}>
						Konto entfernen
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</section>
	{/each}

	<div class="flex-1"></div>

	<Button
		variant="ghost"
		size="lg"
		class="h-10 justify-start gap-2.5 font-normal"
		onclick={onaddaccount}
	>
		<Plus class="size-[18px]" aria-hidden="true" />
		Konto hinzufügen
	</Button>
	<Button variant="ghost" size="lg" class="h-10 justify-start gap-2.5 font-normal">
		<Settings2 class="size-[18px]" aria-hidden="true" />
		Einstellungen
	</Button>
	{#if info}
		<p class="px-2.5 pt-2 text-xs text-muted-foreground">{info.name} {info.version}</p>
	{/if}
</nav>
