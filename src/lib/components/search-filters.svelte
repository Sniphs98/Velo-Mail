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
	import type { Account, SearchFilters } from '#lib/api.ts';
	import { dateValue, fromInputs } from '#lib/calendar/dates.ts';
	import { activeFilters, noFilters } from '#lib/search.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as NativeSelect from '#lib/components/ui/native-select/index.ts';

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
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Follows a reset from outside (e.g. opening a folder).
	$effect(() => {
		if (filters.since === null && filters.until === null && range !== 'custom') range = 'any';
		if (!filters.from) sender = '';
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

	function typeSender(value: string) {
		sender = value;
		clearTimeout(timer);
		timer = setTimeout(() => set({ from: value }), 300);
	}

	function reset() {
		range = 'any';
		sender = '';
		onfilter({ ...noFilters });
	}

	const chip =
		'flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground hover:bg-muted aria-pressed:border-foreground/30 aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground';
</script>

<div role="group" aria-label="Filter" class="flex flex-col gap-2 rounded-lg bg-muted/40 p-2">
	{#if accounts.length > 1}
		<div role="group" aria-label="Konten" class="flex flex-wrap gap-1">
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
			aria-label="Zeitraum"
			size="sm"
			class="min-w-0 flex-1"
			value={range}
			onchange={(event) => chooseRange(event.currentTarget.value as Range)}
		>
			<NativeSelect.Option value="any">Jederzeit</NativeSelect.Option>
			<NativeSelect.Option value="today">Heute</NativeSelect.Option>
			<NativeSelect.Option value="week">7 Tage</NativeSelect.Option>
			<NativeSelect.Option value="month">30 Tage</NativeSelect.Option>
			<NativeSelect.Option value="year">12 Monate</NativeSelect.Option>
			<NativeSelect.Option value="custom">Von – bis …</NativeSelect.Option>
		</NativeSelect.Root>
		<Input
			aria-label="Absender"
			placeholder="Absender"
			class="h-7 min-w-0 flex-1 text-xs"
			value={sender}
			oninput={(event) => typeSender(event.currentTarget.value)}
		/>
	</div>
	{#if range === 'custom'}
		{@const from = filters.since === null ? '' : dateValue(filters.since)}
		{@const to = filters.until === null ? '' : dateValue(filters.until - day)}
		<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
			<Input
				type="date"
				aria-label="Von"
				class="h-7 min-w-0 flex-1 text-xs"
				value={from}
				onchange={(event) => setDates(event.currentTarget.value, to)}
			/>
			bis
			<Input
				type="date"
				aria-label="Bis"
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
			Mit Anhang
		</button>
		<button
			type="button"
			class={chip}
			aria-pressed={filters.unread}
			onclick={() => set({ unread: !filters.unread })}
		>
			Ungelesen
		</button>
		<span class="flex-1"></span>
		{#if activeFilters(filters) > 0}
			<button
				type="button"
				class="text-xs text-muted-foreground hover:text-foreground"
				onclick={reset}
			>
				Zurücksetzen
			</button>
		{/if}
	</div>
</div>
