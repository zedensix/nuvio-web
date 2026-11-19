<script lang="ts">
	import { getLocale, m } from "#lib/i18n/index.js";
	import { dayLabel, type MonthCell } from "#lib/library/calendar.js";
	import { cn } from "#lib/utils.js";

	let {
		weeks,
		today,
		selected,
		onSelect,
	}: {
		weeks: MonthCell[][];
		today: string;
		selected: string;
		onSelect: (key: string) => void;
	} = $props();

	const SHOWN = 3;

	const weekdays = $derived(
		(weeks[0] ?? []).map((cell) =>
			new Intl.DateTimeFormat(getLocale(), {
				weekday: "short",
				timeZone: "UTC",
			}).format(Date.parse(cell.key)),
		),
	);
</script>

<div
  class="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border dark:bg-white/10 dark:ring-white/10"
>
  {#each weekdays as weekday, index (index)}
    <div
      aria-hidden="true"
      class="bg-muted px-1 py-2 text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
    >
      {weekday}
    </div>
  {/each}
  {#each weeks.flat() as cell (cell.key)}
    {@const isToday = cell.key === today}
    {@const isSelected = cell.key === selected}
    <button
      type="button"
      aria-pressed={isSelected}
      onclick={() => onSelect(cell.key)}
      class={cn(
        "relative flex min-h-16 min-w-0 flex-col items-stretch gap-1 bg-background p-1 text-left transition-colors hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-28 sm:p-1.5 lg:min-h-32",
        !cell.inMonth && "bg-muted/40 text-muted-foreground",
        isSelected && "bg-primary/10 hover:bg-primary/15",
      )}
    >
      <span
        class={cn(
          "flex size-6 items-center justify-center self-center rounded-full text-xs font-semibold tabular-nums sm:size-7 sm:self-start sm:text-sm",
          isToday && "bg-primary text-primary-foreground",
          isSelected && !isToday && "ring-2 ring-primary",
        )}
        aria-hidden="true"
      >
        {cell.day}
      </span>
      <span class="sr-only">
        {dayLabel(cell.key)}, {m.calendar_day_count({ count: cell.entries.length })}
      </span>

      {#if cell.entries.length > 0}
        <span class="flex justify-center gap-0.5 sm:hidden" aria-hidden="true">
          {#each cell.entries.slice(0, SHOWN) as entry (`${entry.id}:${entry.season}:${entry.episode}`)}
            <span class="size-1.5 rounded-full bg-primary"></span>
          {/each}
        </span>
        <span class="hidden min-w-0 flex-col gap-1 sm:flex" aria-hidden="true">
          {#each cell.entries.slice(0, SHOWN) as entry (`${entry.id}:${entry.season}:${entry.episode}`)}
            <span
              class="flex min-w-0 items-center gap-1.5 rounded-md bg-muted/80 p-0.5 pr-1.5 dark:bg-white/5"
            >
              {#if entry.poster}
                <img
                  src={entry.poster}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  class="aspect-2/3 w-4 shrink-0 rounded-sm object-cover lg:w-5"
                />
              {/if}
              <span class="min-w-0 truncate text-[11px] leading-tight font-medium">
                {entry.name}
                <span class="hidden text-muted-foreground xl:inline">
                  · {m.media_episode_prefix({ season: entry.season, episode: entry.episode })}
                </span>
              </span>
            </span>
          {/each}
          {#if cell.entries.length > SHOWN}
            <span class="px-1 text-[11px] font-medium text-muted-foreground">
              +{cell.entries.length - SHOWN}
            </span>
          {/if}
        </span>
      {/if}
    </button>
  {/each}
</div>
