<script lang="ts">
	import { Inbox, PenLine, Plus, Settings2 } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { velo, type AppInfo } from '#lib/api.ts';
	import { Button } from '#lib/components/ui/button/index.ts';

	let info = $state<AppInfo>();

	$effect(() => {
		velo()
			?.app.info()
			.then((result) => (info = result));
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

	<div class="flex-1"></div>

	<Button variant="ghost" size="lg" class="h-10 justify-start gap-2.5 font-normal">
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
