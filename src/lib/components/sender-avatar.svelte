<script lang="ts">
	import { avatarColor, initials } from '#lib/avatar.ts';

	let {
		name,
		address,
		size = 40,
		badge
	}: {
		name: string | null;
		address: string | null;
		size?: number;
		/** Account color, shown as a dot when several accounts are listed together. */
		badge?: string;
	} = $props();
</script>

<span class="relative block shrink-0" style:width="{size}px" style:height="{size}px">
	<span
		class="flex size-full items-center justify-center rounded-full font-semibold text-zinc-900"
		style:background={avatarColor(address)}
		style:font-size="{Math.round(size * 0.34)}px"
		aria-hidden="true"
	>
		{initials(name, address)}
	</span>
	{#if badge}
		<span
			class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card"
			style:background={badge}
		></span>
	{/if}
</span>
