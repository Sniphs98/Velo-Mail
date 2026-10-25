<script lang="ts" module>
	export type Range = 'any' | 'today' | 'week' | 'month' | 'year' | 'custom';

	const day = 24 * 3600_000;

	/** Where a preset starts: local midnight of today, or that many days back. */
	export function rangeStart(range: Range, now = new Date()): number | null {
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const back = { today: 0, week: 6, month: 29, year: 364 } as Record<string, number>;
		if (!(range in back)) return null;
		return new Date(
			midnight.getFullYear(),
			midnight.getMonth(),
			midnight.getDate() - back[range]
		).getTime();
	}
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { Account, SearchFilters } from '#lib/api.ts';
	import { dateValue, fromInputs } from '#lib/calendar/dates.ts';
	import { activeFilters, noFilters } from '#lib/search.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';
	import AddressInput from './address-input.svelte';

	let {
		filters,
		accounts,
		onfilter
	}: {
		filters: SearchFilters;
		accounts: Account[];
		onfilter: (filters: SearchFilters) => void;
	} = $props();

	let range = $state<Range>('any');
	let sender = $state('');

	// Follows a reset from outside (e.g. opening a folder).
	let appliedFrom = '';
	$effect(() => {
		if (filters.since === null && filters.until === null && range !== 'custom') range = 'any';
		if (filters.from !== appliedFrom) {
			appliedFrom = filters.from;
			sender = filters.from;
		}
	});

	const set = (changes: Partial<SearchFilters>) => onfilter({ ...filters, ...changes });

	function toggleAccount(id: number) {
		set({
			accounts: filters.accounts.includes(id)
				? filters.accounts.filter((a) => a !== id)
				: [...filters.accounts, id]
		});
	}

	function chooseRange(value: Range) {
		range = value;
		if (value !== 'custom') set({ since: rangeStart(value), until: null });
	}

	function setDates(from: string, to: string) {
		set({
			since: from ? fromInputs(from) : null,
			// Up to the end of the last day.
			until: to ? fromInputs(to) + day : null
		});
	}

	// Typing narrows a moment after the last key; a suggestion at once (onvalue).
	$effect(() => {
		const value = sender;
		if (value === filters.from) return;
		const timer = setTimeout(() => set({ from: value }), 300);
		return () => clearTimeout(timer);
	});

	function reset() {
		range = 'any';
		sender = '';
		onfilter({ ...noFilters });
	}

	const chip =
		'flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground hover:bg-muted aria-pressed:border-foreground/30 aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground';
</script>

<div
	role="group"
	aria-label={m.filter_button()}
	class="flex flex-col gap-2 rounded-lg bg-muted/40 p-2"
>
	{#if accounts.length > 1}
		<div role="group" aria-label={m.filter_accounts()} class="flex flex-wrap gap-1">
			{#each accounts as account (account.id)}
				<button
					type="button"
					class={chip}
					aria-pressed={filters.accounts.includes(account.id)}
					onclick={() => toggleAccount(account.id)}
				>
					<span class="size-2 rounded-full" style:background={account.color}></span>
					{account.name}
				</button>
			{/each}
		</div>
	{/if}
	<div class="flex gap-1.5">
		<NativeSelect.Root
			aria-label={m.filter_range()}
			size="sm"
			class="min-w-0 flex-1"
			value={range}
			onchange={(event) => chooseRange(event.currentTarget.value as Range)}
		>
			<NativeSelect.Option value="any">{m.filter_range_any()}</NativeSelect.Option>
			<NativeSelect.Option value="today">{m.filter_range_today()}</NativeSelect.Option>
			<NativeSelect.Option value="week">{m.filter_range_week()}</NativeSelect.Option>
			<NativeSelect.Option value="month">{m.filter_range_month()}</NativeSelect.Option>
			<NativeSelect.Option value="year">{m.filter_range_year()}</NativeSelect.Option>
			<NativeSelect.Option value="custom">{m.filter_range_custom()}</NativeSelect.Option>
		</NativeSelect.Root>
		<AddressInput
			label={m.filter_sender()}
			placeholder={m.filter_sender()}
			multiple={false}
			class="h-7 rounded-lg border bg-transparent px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			bind:value={sender}
			onvalue={(value) => set({ from: value })}
		/>
	</div>
	{#if range === 'custom'}
		{@const from = filters.since === null ? '' : dateValue(filters.since)}
		{@const to = filters.until === null ? '' : dateValue(filters.until - day)}
		<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
			<Input
				type="date"
				aria-label={m.filter_from()}
				class="h-7 min-w-0 flex-1 text-xs"
				value={from}
				onchange={(event) => setDates(event.currentTarget.value, to)}
			/>
			{m.filter_to_word()}
			<Input
				type="date"
				aria-label={m.filter_to()}
				class="h-7 min-w-0 flex-1 text-xs"
				value={to}
				onchange={(event) => setDates(from, event.currentTarget.value)}
			/>
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-1">
		<button
			type="button"
			class={chip}
			aria-pressed={filters.attachments}
			onclick={() => set({ attachments: !filters.attachments })}
		>
			{m.with_attachment()}
		</button>
		<button
			type="button"
			class={chip}
			aria-pressed={filters.unread}
			onclick={() => set({ unread: !filters.unread })}
		>
			{m.unread()}
		</button>
		<span class="flex-1"></span>
		{#if activeFilters(filters) > 0}
			<button
				type="button"
				class="text-xs text-muted-foreground hover:text-foreground"
				onclick={reset}
			>
				{m.filter_reset()}
			</button>
		{/if}
	</div>
</div>
