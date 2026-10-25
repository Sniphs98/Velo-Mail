<script lang="ts" module>
	export interface Person {
		name?: string;
		address: string;
	}

	/** "Anna Becker <anna@firma.de>"; names with commas or quotes are quoted. */
	export function formatPerson(person: Person) {
		if (!person.name) return person.address;
		const name = /[",<>@;:]/.test(person.name)
			? `"${person.name.replace(/["\\]/g, '\\$&')}"`
			: person.name;
		return `${name} <${person.address}>`;
	}

	/** Where the entry being typed starts: after the last comma or semicolon outside quotes. */
	export function currentEntry(value: string) {
		let start = 0;
		let quoted = false;
		for (let i = 0; i < value.length; i++) {
			if (value[i] === '"') quoted = !quoted;
			else if (!quoted && (value[i] === ',' || value[i] === ';')) start = i + 1;
		}
		return { start, text: value.slice(start).trim() };
	}
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { velo } from '#lib/api.ts';
	import { cn } from '#lib/utils.ts';

	let {
		value = $bindable(''),
		multiple = true,
		id,
		label,
		placeholder,
		class: className,
		inputRef = $bindable(),
		onvalue
	}: {
		value?: string;
		/** A list of addresses (To, Cc) or a single one (a filter). */
		multiple?: boolean;
		id?: string;
		label?: string;
		placeholder?: string;
		class?: string;
		inputRef?: HTMLInputElement;
		/** Called when a suggestion was taken (typing fires input events as usual). */
		onvalue?: (value: string) => void;
	} = $props();

	const listId = $props.id();
	let suggestions = $state<Person[]>([]);
	let active = $state(0);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = 0;

	function lookup() {
		clearTimeout(timer);
		const text = multiple ? currentEntry(value).text : value.trim();
		if (text.length < 1 || /<.*>/.test(text)) {
			open = false;
			return;
		}
		const ask = ++asked;
		timer = setTimeout(async () => {
			const found = (await velo()?.mail.suggestAddresses(text)) ?? [];
			if (ask !== asked) return;
			suggestions = found;
			active = 0;
			open = found.length > 0;
		}, 120);
	}

	function take(person: Person) {
		if (multiple) {
			const { start } = currentEntry(value);
			const before = value.slice(0, start).trimEnd();
			value = `${before ? `${before} ` : ''}${formatPerson(person)}, `;
		} else {
			value = person.address;
		}
		open = false;
		asked++;
		onvalue?.(value);
		inputRef?.focus();
	}

	function keydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + suggestions.length) % suggestions.length;
		} else if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
			event.preventDefault();
			take(suggestions[active]);
		} else if (event.key === 'Escape') {
			// Closes the list only, not what the field sits in.
			event.preventDefault();
			event.stopPropagation();
			open = false;
		}
	}
</script>

<div class="relative min-w-0 flex-1">
	<input
		{id}
		bind:this={inputRef}
		bind:value
		class={cn('w-full', className)}
		{placeholder}
		aria-label={label}
		autocomplete="off"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={listId}
		aria-activedescendant={open ? `${listId}-${active}` : undefined}
		oninput={lookup}
		onkeydown={keydown}
		onblur={() => setTimeout(() => (open = false), 150)}
	/>
	{#if open}
		<ul
			id={listId}
			role="listbox"
			aria-label={m.address_suggestions()}
			class="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-left shadow-md"
		>
			{#each suggestions as person, i (person.address)}
				<li
					id="{listId}-{i}"
					role="option"
					aria-selected={i === active}
					class="flex cursor-pointer flex-col rounded-md px-2 py-1 aria-selected:bg-muted"
					onmousedown={(event) => {
						// Before the input loses focus.
						event.preventDefault();
						take(person);
					}}
					onmouseenter={() => (active = i)}
				>
					{#if person.name}
						<span class="truncate text-sm">{person.name}</span>
					{/if}
					<span class="truncate text-xs text-muted-foreground">{person.address}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
