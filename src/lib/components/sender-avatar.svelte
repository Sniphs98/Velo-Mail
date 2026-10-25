<script lang="ts">
	import { avatarColor, initials } from '#lib/avatar.ts';
	import type { SenderPicture } from '#lib/api.ts';
	import { pictures } from '#lib/pictures.svelte.ts';

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

	let picture = $state<SenderPicture | null>(null);
	// A derived only reports a change when the value changes, so a list or
	// conversation loaded again (new objects, same sender) does not reload it.
	const sender = $derived(address);

	$effect(() => {
		picture = null;
		void pictures.version;
		if (!sender) return;
		let current = true;
		pictures.get(sender).then((found) => {
			if (current) picture = found;
		});
		return () => {
			current = false;
		};
	});
</script>

<span class="relative block shrink-0" style:width="{size}px" style:height="{size}px">
	{#if picture}
		<span
			class="flex size-full items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5"
			aria-hidden="true"
		>
			<img
				src={picture.url}
				alt=""
				class={picture.kind === 'icon' ? 'size-[60%] object-contain' : 'size-full object-cover'}
				onerror={() => (picture = null)}
			/>
		</span>
	{:else}
		<span
			class="flex size-full items-center justify-center rounded-full font-semibold text-zinc-900"
			style:background={avatarColor(address)}
			style:font-size="{Math.round(size * 0.34)}px"
			aria-hidden="true"
		>
			{initials(name, address)}
		</span>
	{/if}
	{#if badge}
		<span
			class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card"
			style:background={badge}
		></span>
	{/if}
</span>
