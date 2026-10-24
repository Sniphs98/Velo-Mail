<script lang="ts">
	import { MailOpen, Search } from '@lucide/svelte';
	import AddAccountDialog from '#lib/components/add-account-dialog.svelte';
	import Sidebar from '#lib/components/sidebar.svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';

	let addingAccount = $state(false);
</script>

<div class="flex h-full gap-3 p-3">
	<Sidebar onaddaccount={() => (addingAccount = true)} />

	<section
		aria-label="Nachrichtenliste"
		class="flex w-96 shrink-0 flex-col gap-3 rounded-2xl border bg-card p-4"
	>
		<h1 class="font-heading text-xl font-semibold">Alle Posteingänge</h1>
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			<Input
				type="search"
				placeholder="Suchen"
				aria-label="Suchen"
				class="h-10 rounded-full border-transparent bg-muted pl-10"
			/>
		</div>
		<p class="py-10 text-center text-sm text-muted-foreground">Noch keine E-Mails</p>
	</section>

	<article
		aria-label="Nachricht"
		class="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center"
	>
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
	</article>
</div>

<AddAccountDialog bind:open={addingAccount} />
