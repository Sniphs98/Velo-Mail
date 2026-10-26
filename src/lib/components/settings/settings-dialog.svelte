<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Search } from '@lucide/svelte';
	import { dialogs } from '#lib/dialogs.svelte.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { findPages, pages } from './pages.ts';

	let query = $state('');
	const found = $derived(findPages(query));
	const groups = $derived([...new Set(found.map((page) => page.group()))]);
	const current = $derived(pages.find((page) => page.id === dialogs.settingsPage) ?? pages[0]);

	$effect(() => {
		if (!dialogs.settings) return;
		settings.load();
		query = '';
	});
</script>

<Dialog.Root bind:open={dialogs.settings}>
	<Dialog.Content size="lg" class="gap-0 overflow-hidden p-0">
		<Dialog.Header class="border-b px-5 py-3.5">
			<Dialog.Title class="font-heading">{m.settings_title()}</Dialog.Title>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1">
			<nav
				aria-label={m.settings_pages()}
				class="flex w-14 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2 md:w-60 md:p-3"
			>
				<div class="relative mb-2 hidden md:block">
					<Search
						class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						type="search"
						class="h-8 pl-8"
						placeholder={m.settings_search()}
						aria-label={m.settings_search()}
						bind:value={query}
					/>
				</div>
				{#each groups as group (group)}
					<div class="flex flex-col gap-px pb-2">
						<span
							class="hidden px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:block"
							>{group}</span
						>
						{#each found.filter((page) => page.group() === group) as page (page.id)}
							<button
								type="button"
								aria-current={page.id === current.id ? 'page' : undefined}
								title={page.label()}
								class="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-foreground/80 transition-colors hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
								onclick={() => (dialogs.settingsPage = page.id)}
							>
								<page.icon class="size-4 shrink-0" aria-hidden="true" />
								<span class="hidden truncate md:inline">{page.label()}</span>
							</button>
						{/each}
					</div>
				{:else}
					<p class="px-2 text-sm text-muted-foreground">{m.settings_search_none()}</p>
				{/each}
			</nav>

			<div class="min-w-0 flex-1 overflow-y-auto">
				{#key current.id}
					<current.component />
				{/key}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
