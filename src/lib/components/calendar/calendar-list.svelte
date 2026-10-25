<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { Ellipsis } from '@lucide/svelte';
	import { velo } from '#lib/api.ts';
	import { calendar } from '#lib/calendar.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
</script>

{#each calendar.sources as source (source.id)}
	<section aria-label={source.name} class="flex flex-col gap-px">
		<div class="group/source flex items-center gap-2 pt-3 pr-0.5 pb-0.5 pl-2">
			<span class="min-w-0 flex-1 truncate text-[13px] font-semibold">{source.name}</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="opacity-0 group-hover/source:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
							aria-label={m.sidebar_account_options({ name: source.name })}
						>
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={() => velo()?.calendar.sync()}>
						{m.sidebar_sync_now()}
					</DropdownMenu.Item>
					<DropdownMenu.Item
						variant="destructive"
						onclick={() => velo()?.calendar.removeSource(source.id)}
					>
						{m.calendar_remove()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
		{#each calendar.calendars.filter((c) => c.sourceId === source.id) as item (item.id)}
			<label
				class="flex h-8 cursor-pointer items-center gap-2 rounded-md pr-2 pl-3 text-sm hover:bg-muted"
			>
				<input
					type="checkbox"
					class="size-3.5 cursor-pointer rounded"
					style:accent-color={item.color}
					checked={item.enabled}
					onchange={() => calendar.toggle(item)}
				/>
				<span class="truncate">{item.name}</span>
			</label>
		{/each}
	</section>
{/each}
