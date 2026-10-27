<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		wide = false,
		children
	}: {
		title: string;
		description?: string;
		/** Uses the whole width, e.g. for a list beside its details. */
		wide?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="mx-auto flex flex-col gap-6 p-6" class:max-w-3xl={!wide}>
	<header class="flex flex-col gap-1">
		<h2 class="font-heading text-lg font-semibold">{title}</h2>
		{#if description}
			<p class="text-sm text-muted-foreground">{description}</p>
		{/if}
	</header>
	{@render children()}
</div>
