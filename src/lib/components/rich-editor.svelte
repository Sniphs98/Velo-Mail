<script lang="ts">
	import { Editor } from '@tiptap/core';
	import { untrack } from 'svelte';
	import { Placeholder } from '@tiptap/extensions';
	import StarterKit from '@tiptap/starter-kit';
	import { Bold, Italic, Link, List, ListOrdered } from '@lucide/svelte';
	import { Signature } from '#lib/editor/signature.ts';
	import { Button } from '#lib/components/ui/button/index.ts';

	let {
		html,
		onchange,
		label = 'Nachricht'
	}: {
		/** Content to show; replacing it from outside resets the editor. */
		html: string;
		onchange: (html: string) => void;
		label?: string;
	} = $props();

	let element = $state<HTMLDivElement>();
	let editor = $state<Editor>();
	/** Bumped on every transaction, so the toolbar shows the current marks. */
	let tick = $state(0);
	/** What the editor last reported, to tell outside changes from our own. */
	let reported = '';

	// Created once; content and callbacks are read without subscribing.
	$effect(() => {
		if (!element) return;
		const target = element;
		return untrack(() => create(target));
	});

	function create(target: HTMLElement) {
		const instance = new Editor({
			element: target,
			content: html,
			extensions: [
				StarterKit.configure({
					heading: false,
					codeBlock: false,
					code: false,
					horizontalRule: false,
					link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
				}),
				Placeholder.configure({ placeholder: 'Schreib deine Nachricht …' }),
				Signature
			],
			editorProps: {
				attributes: {
					role: 'textbox',
					'aria-multiline': 'true',
					'aria-label': label,
					class: 'mail-editor min-h-full text-[15px] leading-relaxed outline-none'
				}
			},
			// untrack: transactions also happen inside effects (setContent below).
			onTransaction: () => untrack(() => tick++),
			onUpdate: ({ editor }) => {
				reported = editor.getHTML();
				onchange(reported);
			}
		});
		reported = instance.getHTML();
		editor = instance;
		return () => instance.destroy();
	}

	// Content set from outside (another account's signature, a loaded draft).
	$effect(() => {
		const next = html;
		if (editor && next !== reported) {
			editor.commands.setContent(next, { emitUpdate: false });
			reported = editor.getHTML();
		}
	});

	function isActive(name: string) {
		void tick;
		return editor?.isActive(name) ?? false;
	}

	/** The address being entered for a link; undefined while the field is hidden. */
	let linkHref = $state<string>();
	let linkInput = $state<HTMLInputElement>();

	// Electron has no window.prompt, so the address goes into a field of our own.
	function editLink() {
		linkHref = (editor?.getAttributes('link').href as string | undefined) ?? 'https://';
		setTimeout(() => linkInput?.select());
	}

	function applyLink() {
		if (!editor || linkHref === undefined) return;
		const href = linkHref.trim();
		const chain = editor.chain().focus().extendMarkRange('link');
		if (href === '' || href === 'https://') chain.unsetLink().run();
		else
			chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}` }).run();
		linkHref = undefined;
	}

	const tools = [
		{
			name: 'bold',
			label: 'Fett',
			icon: Bold,
			run: () => editor?.chain().focus().toggleBold().run()
		},
		{
			name: 'italic',
			label: 'Kursiv',
			icon: Italic,
			run: () => editor?.chain().focus().toggleItalic().run()
		},
		{
			name: 'bulletList',
			label: 'Aufzählung',
			icon: List,
			run: () => editor?.chain().focus().toggleBulletList().run()
		},
		{
			name: 'orderedList',
			label: 'Nummerierte Liste',
			icon: ListOrdered,
			run: () => editor?.chain().focus().toggleOrderedList().run()
		},
		{ name: 'link', label: 'Link', icon: Link, run: editLink }
	];
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!-- mousedown is cancelled so the editor keeps focus and its selection. -->
	<div role="toolbar" aria-label="Formatierung" class="flex gap-0.5 px-4 pt-2">
		{#each tools as tool (tool.name)}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={tool.label}
				aria-pressed={isActive(tool.name)}
				class="aria-pressed:bg-muted"
				onmousedown={(event: MouseEvent) => event.preventDefault()}
				onclick={tool.run}
			>
				<tool.icon />
			</Button>
		{/each}
	</div>
	{#if linkHref !== undefined}
		<div class="flex items-center gap-2 px-5 pt-2">
			<input
				bind:this={linkInput}
				bind:value={linkHref}
				aria-label="Adresse des Links"
				class="h-8 min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						applyLink();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						event.stopPropagation();
						linkHref = undefined;
						editor?.commands.focus();
					}
				}}
			/>
			<Button size="sm" onclick={applyLink}>Übernehmen</Button>
		</div>
	{/if}
	<div
		bind:this={element}
		class="min-h-[40vh] flex-1 cursor-text overflow-y-auto px-5 py-3"
		onclick={(event) => {
			if (event.target === element) editor?.commands.focus('end');
		}}
		role="presentation"
	></div>
</div>

<style>
	:global(.mail-editor p) {
		margin: 0 0 0.75em;
	}
	:global(.mail-editor ul) {
		list-style: disc;
		padding-left: 1.5em;
		margin: 0 0 0.75em;
	}
	:global(.mail-editor ol) {
		list-style: decimal;
		padding-left: 1.5em;
		margin: 0 0 0.75em;
	}
	:global(.mail-editor li p) {
		margin: 0;
	}
	:global(.mail-editor a) {
		color: var(--color-blue-600);
		text-decoration: underline;
	}
	:global(.mail-editor blockquote) {
		border-left: 3px solid var(--border);
		padding-left: 12px;
		color: var(--muted-foreground);
		margin: 0 0 0.75em;
	}
	:global(.mail-editor .signature) {
		color: var(--muted-foreground);
	}
	:global(.mail-editor p.is-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--muted-foreground);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
