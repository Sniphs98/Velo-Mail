<script lang="ts">
	import { Inbox, PenLine, Plus, Settings2 } from '@lucide/svelte';
	import { velo, type AppInfo } from '#lib/api.ts';
	import { resolve } from '$app/paths';

	let info = $state<AppInfo>();

	$effect(() => {
		velo()
			?.app.info()
			.then((result) => (info = result));
	});
</script>

<nav
	aria-label="Konten und Ordner"
	class="flex w-60 shrink-0 flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-3.5"
>
	<button
		type="button"
		disabled
		class="mb-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-medium text-zinc-50 disabled:opacity-50"
	>
		<PenLine class="size-4" aria-hidden="true" />
		Neue Nachricht
	</button>

	<a
		href={resolve('/')}
		aria-current="page"
		class="flex h-10 items-center gap-2.5 rounded-lg bg-zinc-100 px-2.5 text-sm font-medium"
	>
		<Inbox class="size-[18px]" aria-hidden="true" />
		Alle Posteingänge
	</a>

	<div class="flex-1"></div>

	<button
		type="button"
		class="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-zinc-700 hover:bg-zinc-100"
	>
		<Plus class="size-[18px]" aria-hidden="true" />
		Konto hinzufügen
	</button>
	<button
		type="button"
		class="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-zinc-700 hover:bg-zinc-100"
	>
		<Settings2 class="size-[18px]" aria-hidden="true" />
		Einstellungen
	</button>
	{#if info}
		<p class="px-2.5 pt-2 text-xs text-zinc-500">{info.name} {info.version}</p>
	{/if}
</nav>
