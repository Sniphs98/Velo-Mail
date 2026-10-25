<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { followColorScheme } from '#lib/theme.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	$effect(() => followColorScheme());

	// For screen readers and spelling: the language the texts are in.
	$effect(() => {
		document.documentElement.lang = getLocale();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Velo Mail</title>
</svelte:head>

{@render children()}
