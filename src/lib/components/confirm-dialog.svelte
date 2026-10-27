<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';

	let {
		open = $bindable(false),
		title,
		description,
		confirm,
		onconfirm
	}: {
		open?: boolean;
		title: string;
		description: string;
		/** The label of the button that does it. */
		confirm: string;
		onconfirm: () => unknown;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content size="sm" showCloseButton={false}>
		<Dialog.Header>
			<Dialog.Title class="font-heading">{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
			<Button
				variant="destructive"
				onclick={async () => {
					open = false;
					await onconfirm();
				}}
			>
				{confirm}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
