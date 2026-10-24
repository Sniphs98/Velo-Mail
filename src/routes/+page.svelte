<script lang="ts">
	import { MailOpen, Search } from '@lucide/svelte';
	import Sidebar from '#lib/components/sidebar.svelte';
</script>

<div class="flex h-full gap-3 p-3">
	<Sidebar />

	<section
		aria-label="Nachrichtenliste"
		class="flex w-96 shrink-0 flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
	>
		<h1 class="text-xl font-semibold">Alle Posteingänge</h1>
		<label class="flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-3.5 text-zinc-500">
			<Search class="size-4" aria-hidden="true" />
			<span class="sr-only">Suchen</span>
			<input
				type="search"
				placeholder="Suchen"
				class="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none"
			/>
		</label>
		<p class="py-10 text-center text-sm text-zinc-500">Noch keine E-Mails</p>
	</section>

	<article
		aria-label="Nachricht"
		class="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-center"
	>
		<MailOpen class="size-10 text-zinc-300" aria-hidden="true" />
		<h2 class="text-lg font-semibold">Willkommen bei Velo Mail</h2>
		<p class="max-w-sm text-sm text-zinc-600">
			Füge ein E-Mail-Konto hinzu, um deine Nachrichten hier zu lesen.
		</p>
	</article>
</div>
