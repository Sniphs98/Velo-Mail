<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Download, X } from '@lucide/svelte';
	import { update } from '#lib/update.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
</script>

{#if update.available && !update.dismissed}
	{@const info = update.available}
	<section
		aria-label={m.update()}
		class="mb-1 flex flex-col gap-1.5 rounded-lg border bg-muted/50 p-2 text-xs"
	>
		<div class="flex items-start gap-1.5">
			<Download class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<p role="status" class="min-w-0 flex-1">
				{#if update.phase === 'downloading'}
					{m.update_downloading({ version: info.version, percent: Math.round(update.percent) })}
				{:else if update.phase === 'ready'}
					{m.update_ready({ version: info.version })}
				{:else if update.phase === 'failed'}
					{m.update_failed({ error: update.error ?? '' })}
				{:else}
					{m.update_available({ version: info.version })}
				{/if}
			</p>
			{#if update.phase !== 'downloading'}
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground"
					aria-label={m.later()}
					onclick={() => (update.dismissed = true)}
				>
					<X class="size-3.5" />
				</button>
			{/if}
		</div>
		{#if update.phase === 'downloading'}
			<div class="h-1 overflow-hidden rounded-full bg-border">
				<div class="h-full bg-primary transition-all" style:width="{update.percent}%"></div>
			</div>
		{:else if update.phase === 'ready'}
			<Button size="xs" onclick={() => update.restart()}>{m.update_restart()}</Button>
		{:else if info.canSelfUpdate}
			<Button size="xs" onclick={() => update.install()}>
				{update.phase === 'failed' ? m.retry() : m.update_install()}
			</Button>
		{:else}
			<Button size="xs" variant="outline" href={info.url} target="_blank" rel="noreferrer">
				{m.download()}
			</Button>
		{/if}
	</section>
{/if}
