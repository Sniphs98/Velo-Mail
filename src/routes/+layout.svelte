<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { followColorScheme } from '#lib/theme.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	$effect(() => followColorScheme());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Velo Mail</title>
</svelte:head>

{@render children()}
