<script lang="ts">
	import { Download, ExternalLink, ImageOff, Paperclip } from '@lucide/svelte';
	import { ipcErrorMessage } from '#lib/account-messages.ts';
	import { velo, type MessageBody } from '#lib/api.ts';
	import { fileSize } from '#lib/format.ts';
	import { mailDocument } from '#lib/mail-html.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Spinner } from '#lib/components/ui/spinner/index.ts';

	let { messageId, sender = null }: { messageId: number; sender?: string | null } = $props();

	let body = $state<MessageBody>();
	let error = $state<string>();
	let remote = $state(false);
	let notice = $state<string>();
	let height = $state(120);
	// Only a different message loads again: while a folder syncs, the open
	// conversation is reloaded as new objects with the same ids, and loading
	// each time made the content flicker and jump back to the top.
	const message = $derived(messageId);

	$effect(() => {
		const id = message;
		body = undefined;
		error = undefined;
		remote = false;
		notice = undefined;
		velo()
			?.mail.body(id)
			.then((result) => {
				if (id !== messageId) return;
				body = result;
				remote = result.trusted;
			})
			.catch((e) => {
				if (id === messageId) error = ipcErrorMessage(e);
			});
	});

	const srcdoc = $derived(body?.html ? mailDocument(body.html, { remote }) : undefined);

	/** Grows the frame to its content, so only the reading pane scrolls. */
	function fit(event: Event) {
		const frame = event.currentTarget as HTMLIFrameElement;
		const doc = frame.contentDocument;
		if (!doc) return;
		const measure = () => (height = Math.max(doc.documentElement.scrollHeight, 40));
		measure();
		// Images arriving later change the height.
		for (const image of doc.images) image.addEventListener('load', measure);
	}

	async function trust() {
		if (!sender) return;
		remote = true;
		await velo()?.mail.trustSender(sender);
	}

	async function open(id: number) {
		notice = undefined;
		try {
			const opened = await velo()?.mail.openAttachment(id);
			if (opened === false) {
				notice =
					'Dieser Dateityp wird aus Sicherheitsgründen nicht geöffnet. Du kannst ihn speichern.';
			}
		} catch (e) {
			notice = ipcErrorMessage(e);
		}
	}

	async function save(id: number) {
		notice = undefined;
		try {
			await velo()?.mail.saveAttachment(id);
		} catch (e) {
			notice = ipcErrorMessage(e);
		}
	}
</script>

{#if error}
	<p class="text-sm text-destructive">Der Inhalt konnte nicht geladen werden: {error}</p>
{:else if !body}
	<p class="flex items-center gap-2 text-sm text-muted-foreground">
		<Spinner /> Inhalt wird geladen …
	</p>
{:else}
	{#if body.remoteContent && !remote}
		<div class="flex items-center gap-3 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
			<ImageOff class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="flex-1 text-muted-foreground">
				Externe Bilder wurden blockiert, damit der Absender nicht sieht, wann du die Mail liest.
			</span>
			<Button variant="outline" size="sm" onclick={() => (remote = true)}>Bilder laden</Button>
			{#if sender}
				<Button variant="ghost" size="sm" onclick={trust}>Immer von diesem Absender</Button>
			{/if}
		</div>
	{/if}

	{#if srcdoc}
		<!-- HTML mails are designed for a light page, so they keep one in dark mode. -->
		<div class="dark:rounded-xl dark:bg-white dark:p-4">
			<iframe
				title="Inhalt der Nachricht"
				class="w-full border-0"
				style:height="{height}px"
				sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
				{srcdoc}
				onload={fit}
			></iframe>
		</div>
	{:else if body.text}
		<div class="text-sm leading-relaxed break-words whitespace-pre-wrap">{body.text}</div>
	{:else}
		<p class="text-sm text-muted-foreground">Diese Nachricht hat keinen Text.</p>
	{/if}

	{#if body.attachments.length > 0}
		<ul aria-label="Anhänge" class="flex flex-wrap gap-2">
			{#each body.attachments as file (file.id)}
				<li class="flex items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-3 text-sm">
					<Paperclip class="size-4 text-muted-foreground" aria-hidden="true" />
					<span class="max-w-56 truncate">{file.filename ?? 'Anhang'}</span>
					<span class="text-xs text-muted-foreground">{fileSize(file.size)}</span>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="{file.filename ?? 'Anhang'} öffnen"
						onclick={() => open(file.id)}
					>
						<ExternalLink />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="{file.filename ?? 'Anhang'} speichern"
						onclick={() => save(file.id)}
					>
						<Download />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if notice}
		<p role="status" class="text-sm text-muted-foreground">{notice}</p>
	{/if}
{/if}
