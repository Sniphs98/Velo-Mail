<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		actions,
		flush = false,
		children
	}: {
		title: string;
		description?: string;
		/** Buttons beside the title. */
		actions?: Snippet;
		/** The content brings its own padding, e.g. a table. */
		flush?: boolean;
		children: Snippet;
	} = $props();

	const id = $props.id();
</script>

<section aria-labelledby={id} class="flex flex-col gap-2">
	<div class="flex items-end justify-between gap-4">
		<div class="flex flex-col gap-0.5">
			<h3 {id} class="text-sm font-semibold">{title}</h3>
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	<div class="flex flex-col divide-y rounded-xl border bg-card" class:px-4={!flush}>
		{@render children()}
	</div>
</section>
