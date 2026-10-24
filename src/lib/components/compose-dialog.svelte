<script lang="ts">
	import { Paperclip, Send, Trash2, X } from '@lucide/svelte';
	import { accounts } from '#lib/accounts.svelte.ts';
	import { compose } from '#lib/compose.svelte.ts';
	import { fileSize } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';

	let showCc = $state(false);

	// Saves the draft two seconds after the last change.
	$effect(() => {
		if (!compose.open || !compose.dirty) return;
		const timer = setTimeout(() => compose.save(), 2000);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (compose.open) showCc = Boolean(compose.draft.cc || compose.draft.bcc);
	});

	const title = $derived(
		compose.draft.replyTo
			? 'Antworten'
			: compose.draft.subject.match(/^\s*(fwd?|wg):/i)
				? 'Weiterleiten'
				: 'Neue Nachricht'
	);

	const fieldClass =
		'min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground';
</script>

<Dialog.Root
	open={compose.open}
	onOpenChange={(open) => {
		if (!open) compose.close();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
		onkeydown={(event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
				event.preventDefault();
				compose.send();
			}
		}}
	>
		<div class="flex items-center justify-between border-b px-5 py-3">
			<Dialog.Title class="font-heading text-base font-semibold">{title}</Dialog.Title>
			<Button variant="ghost" size="icon-sm" aria-label="Schließen" onclick={() => compose.close()}>
				<X />
			</Button>
		</div>

		<form
			class="flex min-h-0 flex-1 flex-col"
			oninput={() => compose.changed()}
			onsubmit={(event) => {
				event.preventDefault();
				compose.send();
			}}
		>
			<div class="flex flex-col px-5">
				{#if accounts.list.length > 1}
					<label class="flex items-center gap-3 border-b">
						<span class="w-16 text-sm text-muted-foreground">Von</span>
						<NativeSelect.Root
							class="my-2 w-auto border-transparent"
							value={compose.draft.accountId}
							onchange={(event: Event) =>
								compose.changeAccount(Number((event.currentTarget as HTMLSelectElement).value))}
						>
							{#each accounts.list as account (account.id)}
								<NativeSelect.Option value={account.id}>
									{account.name} &lt;{account.email}&gt;
								</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</label>
				{/if}
				<div class="flex items-center gap-3 border-b">
					<label class="flex min-w-0 flex-1 items-center gap-3">
						<span class="w-16 text-sm text-muted-foreground">An</span>
						<input class={fieldClass} bind:value={compose.draft.to} autocomplete="off" />
					</label>
					{#if !showCc}
						<button
							type="button"
							class="text-[13px] text-muted-foreground hover:text-foreground"
							onclick={() => (showCc = true)}
						>
							Cc/Bcc
						</button>
					{/if}
				</div>
				{#if showCc}
					<label class="flex items-center gap-3 border-b">
						<span class="w-16 text-sm text-muted-foreground">Cc</span>
						<input class={fieldClass} bind:value={compose.draft.cc} autocomplete="off" />
					</label>
					<label class="flex items-center gap-3 border-b">
						<span class="w-16 text-sm text-muted-foreground">Bcc</span>
						<input class={fieldClass} bind:value={compose.draft.bcc} autocomplete="off" />
					</label>
				{/if}
				<label class="flex items-center gap-3 border-b">
					<span class="w-16 text-sm text-muted-foreground">Betreff</span>
					<input class="{fieldClass} font-medium" bind:value={compose.draft.subject} />
				</label>
			</div>

			<label class="flex min-h-[40vh] flex-1 px-5 py-4">
				<span class="sr-only">Nachricht</span>
				<textarea
					class="min-h-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none"
					bind:value={compose.draft.text}></textarea>
			</label>

			{#if compose.attachments.length > 0}
				<ul aria-label="Anhänge" class="flex flex-wrap gap-2 px-5 pb-3">
					{#each compose.attachments as file (file.path)}
						<li class="flex items-center gap-2 rounded-xl border py-1 pr-1 pl-3 text-sm">
							<span class="max-w-56 truncate">{file.name}</span>
							<span class="text-xs text-muted-foreground">{fileSize(file.size)}</span>
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label="{file.name} entfernen"
								onclick={() => compose.detach(file.path)}
							>
								<X />
							</Button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if compose.error}
				<p role="alert" class="px-5 pb-3 text-sm text-destructive">{compose.error}</p>
			{/if}

			<div class="flex items-center gap-1 border-t px-4 py-3">
				<Button type="submit" class="h-10 rounded-xl px-4" disabled={compose.status === 'sending'}>
					{#if compose.status === 'sending'}
						<Spinner /> Wird gesendet …
					{:else}
						<Send /> Senden
					{/if}
				</Button>
				<Button
					variant="ghost"
					size="icon-lg"
					aria-label="Anhang hinzufügen"
					onclick={() => compose.attach()}
				>
					<Paperclip />
				</Button>
				<span class="flex-1 px-2 text-xs text-muted-foreground" role="status">
					{#if compose.status === 'saving'}Entwurf wird gespeichert …{:else if compose.status === 'saved'}Entwurf
						gespeichert{/if}
				</span>
				<Button
					variant="ghost"
					size="icon-lg"
					aria-label="Entwurf verwerfen"
					onclick={() => compose.discard()}
				>
					<Trash2 />
				</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
