<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Field from '#lib/components/ui/field/index.ts';

	let {
		label,
		for: id,
		description,
		hint,
		children
	}: {
		label: string;
		/** The id of the control, so that the label names it. */
		for: string;
		description?: string;
		/** More below the description, e.g. a status. */
		hint?: Snippet;
		children: Snippet;
	} = $props();
</script>

<Field.Field orientation="horizontal" class="gap-6 py-3.5">
	<Field.Content>
		<Field.Label for={id}>{label}</Field.Label>
		{#if description || hint}
			<Field.Description>
				{description}
				{@render hint?.()}
			</Field.Description>
		{/if}
	</Field.Content>
	{@render children()}
</Field.Field>
