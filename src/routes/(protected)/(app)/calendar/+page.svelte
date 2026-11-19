<script lang="ts">
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ListIcon from "@lucide/svelte/icons/list";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import {
		airTime,
		type CalendarEntry,
		dayKey,
		dayLabel,
		groupByDay,
		monthGrid,
		shiftMonth,
		untilLabel,
		weekStart,
	} from "#lib/library/calendar.js";
	import { cn } from "#lib/utils.js";
	import { resolve } from "$app/paths";
	import { navigating } from "$app/state";
	import EpisodeCard from "./episode-card.svelte";
	import MonthGrid from "./month-grid.svelte";

	pageTitle.set(m.nav_calendar());

	let { data } = $props();

	const entriesStream = streamed(() => data.entries, [] as CalendarEntry[]);
	const now = Date.now();
	const today = dayKey(now);

	const views = [
		{
			value: "list",
			label: m.calendar_view_list(),
			icon: ListIcon,
			href: resolve("calendar"),
		},
		{
			value: "month",
			label: m.calendar_view_month(),
			icon: CalendarRangeIcon,
			href: `${resolve("calendar")}?view=month`,
		},
	] as const;
	const monthHref = (month: string) =>
		`${resolve("calendar")}?view=month&month=${month}`;

	// List view
	const days = $derived(groupByDay(entriesStream.current, now, getLocale()));
	const sections = $derived(
		[
			{ heading: m.calendar_upcoming(), days: days.upcoming },
			{ heading: m.calendar_recent(), days: days.recent },
		].filter((section) => section.days.length > 0),
	);
	const upNext = $derived(
		days.upcoming
			.flatMap((day) => day.entries)
			.find((entry) => Date.parse(entry.airsAt) >= now) ?? null,
	);

	let heroStillFailed = $state(false);
	const heroStill = $derived(heroStillFailed ? null : (upNext?.still ?? null));

	// Month view
	const weeks = $derived(
		monthGrid(data.month, entriesStream.current, weekStart(getLocale())),
	);
	const monthTitle = $derived(
		new Intl.DateTimeFormat(getLocale(), {
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}).format(Date.parse(`${data.month}-01`)),
	);
	// Today when it's in the month shown, else its first day that airs something.
	let picked = $state<{ month: string; key: string } | null>(null);
	const selected = $derived.by(() => {
		if (picked?.month === data.month) {
			return picked.key;
		}
		const cells = weeks.flat().filter((cell) => cell.inMonth);
		return (
			cells.find((cell) => cell.key === today)?.key ??
			cells.find((cell) => cell.entries.length > 0)?.key ??
			cells[0]?.key ??
			today
		);
	});
	const selectedEntries = $derived(
		weeks.flat().find((cell) => cell.key === selected)?.entries ?? [],
	);
	const switching = $derived(
		navigating.to?.url.pathname === resolve("calendar"),
	);

	// Today, tomorrow and yesterday read better by name than by month.
	const nearby = new Set(
		[-1, 0, 1].map((offset) => dayKey(now + offset * 86_400_000)),
	);
	const dayParts = (key: string) => ({
		weekday: new Intl.DateTimeFormat(getLocale(), {
			weekday: "short",
			timeZone: "UTC",
		}).format(Date.parse(key)),
		day: Number(key.slice(8)),
		month: new Intl.DateTimeFormat(getLocale(), {
			month: "long",
			...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
			timeZone: "UTC",
		}).format(Date.parse(key)),
	});
</script>

{#snippet entryGrid(entries: CalendarEntry[])}
  <ul
    class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-y-5"
  >
    {#each entries as entry (`${entry.id}:${entry.season}:${entry.episode}`)}
      <li><EpisodeCard {entry} /></li>
    {/each}
  </ul>
{/snippet}

{#snippet skeletonCards()}
  <div
    class="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
    aria-hidden="true"
  >
    {#each { length: 8 } as _skeleton, index (index)}
      <div class="flex items-center gap-3 sm:flex-col sm:items-stretch">
        <div class="skeleton aspect-video w-36 rounded-xl sm:w-full"></div>
        <div class="skeleton h-9 flex-1 rounded-md sm:flex-none"></div>
      </div>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col gap-8">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold tracking-tight">{m.nav_calendar()}</h1>
      <p class="text-sm text-muted-foreground">{m.calendar_subtitle()}</p>
    </div>
    <nav
      aria-label={m.calendar_view()}
      class="inline-flex rounded-full bg-muted p-1 ring-1 ring-border dark:ring-white/10"
    >
      {#each views as view (view.value)}
        {@const active = data.view === view.value}
        <a
          href={view.href}
          aria-current={active ? "page" : undefined}
          data-sveltekit-noscroll
          class={cn(
            "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <view.icon class="size-4" aria-hidden="true" />
          {view.label}
        </a>
      {/each}
    </nav>
  </header>

  {#if data.view === "month"}
    <section aria-labelledby="calendar-month" class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <h2
          id="calendar-month"
          class="text-xl font-bold tracking-tight first-letter:uppercase sm:text-2xl"
        >
          {monthTitle}
        </h2>
        <div class="flex items-center gap-1">
          <Button
            href={`${resolve("calendar")}?view=month`}
            variant="outline"
            size="sm"
            data-sveltekit-noscroll
          >
            {m.calendar_this_month()}
          </Button>
          <Button
            href={monthHref(shiftMonth(data.month, -1))}
            variant="ghost"
            size="icon"
            aria-label={m.calendar_previous_month()}
            data-sveltekit-noscroll
          >
            <ChevronLeftIcon class="size-5" />
          </Button>
          <Button
            href={monthHref(shiftMonth(data.month, 1))}
            variant="ghost"
            size="icon"
            aria-label={m.calendar_next_month()}
            data-sveltekit-noscroll
          >
            <ChevronRightIcon class="size-5" />
          </Button>
        </div>
      </div>

      {#if !entriesStream.ready}
        <div class="skeleton h-112 rounded-2xl sm:h-176" aria-hidden="true"></div>
      {:else}
        <div class={cn("transition-opacity", switching && "opacity-60")}>
          <MonthGrid
            {weeks}
            {today}
            {selected}
            onSelect={(key) => (picked = { month: data.month, key })}
          />
        </div>

        <section aria-labelledby="calendar-selected-day" class="flex flex-col gap-3">
          <h3
            id="calendar-selected-day"
            class="text-lg font-semibold first-letter:uppercase"
          >
            {dayLabel(selected)}
          </h3>
          {#if selectedEntries.length > 0}
            {@render entryGrid(selectedEntries)}
          {:else}
            <p class="text-sm text-muted-foreground">
              {weeks.flat().some((cell) => cell.inMonth && cell.entries.length > 0)
                ? m.calendar_day_empty()
                : m.calendar_month_empty()}
            </p>
          {/if}
        </section>
      {/if}
    </section>
  {:else if !entriesStream.ready}
    <div class="flex flex-col gap-6" aria-hidden="true">
      <div class="skeleton aspect-video rounded-3xl sm:aspect-21/7"></div>
      {@render skeletonCards()}
    </div>
  {:else if sections.length === 0}
    <EmptyState
      icon={CalendarDaysIcon}
      title={m.calendar_empty_title()}
      description={m.calendar_empty_description()}
    >
      {#snippet actions()}
        <Button href={resolve("library")} variant="outline">{m.nav_library()}</Button>
      {/snippet}
    </EmptyState>
  {:else}
    {#if upNext}
      {@const time = airTime(upNext.airsAt)}
      <a
        href={resolve(`detail/series/${encodeURIComponent(upNext.id)}`)}
        data-sveltekit-preload-data="hover"
        class="group relative isolate flex aspect-video items-end overflow-hidden rounded-3xl bg-muted ring-1 ring-border sm:aspect-21/7 dark:ring-white/10"
      >
        {#if heroStill ?? upNext.poster}
          <img
            src={heroStill ?? upNext.poster}
            onerror={() => (heroStillFailed = true)}
            alt=""
            decoding="async"
            class={cn(
              "absolute inset-0 -z-10 size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]",
              !heroStill && "scale-110 blur-2xl",
            )}
          />
        {/if}
        <div
          class="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/40 to-transparent sm:bg-linear-to-r sm:from-black/85 sm:via-black/45"
        ></div>
        <div class="flex w-full items-end gap-4 p-4 text-white sm:p-8">
          {#if upNext.poster}
            <img
              src={upNext.poster}
              alt=""
              decoding="async"
              class="hidden aspect-2/3 w-24 shrink-0 rounded-xl object-cover shadow-2xl ring-1 ring-white/20 md:block lg:w-28"
            />
          {/if}
          <div class="flex min-w-0 flex-col gap-1.5">
            <span
              class="w-fit rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-primary-foreground uppercase"
            >
              {m.calendar_up_next()}
            </span>
            <p class="truncate text-2xl font-bold tracking-tight sm:text-4xl">
              {upNext.name}
            </p>
            <p class="truncate text-sm text-white/80 sm:text-base">
              {m.media_episode_prefix({ season: upNext.season, episode: upNext.episode })}{upNext.title
                ? ` · ${upNext.title}`
                : ""}
            </p>
            <p class="text-sm font-semibold text-white first-letter:uppercase">
              {untilLabel(upNext.airsAt, now)}{time ? ` · ${time}` : ""}
            </p>
          </div>
        </div>
      </a>
    {/if}

    {#each sections as section (section.heading)}
      <section class="flex flex-col gap-5">
        <h2 class="text-xl font-bold tracking-tight">{section.heading}</h2>
        <div
          class="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
        >
          {#each section.days as day (day.key)}
            {@const parts = dayParts(day.key)}
            {@const isToday = day.key === today}
            <section aria-labelledby={`day-${day.key}`} class="flex flex-col gap-3">
              <div class="flex items-center gap-3">
                <div
                  class={cn(
                    "flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl",
                    isToday ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                  aria-hidden="true"
                >
                  <span class="text-[10px] leading-none font-semibold tracking-wider uppercase opacity-80">
                    {parts.weekday}
                  </span>
                  <span class="text-xl leading-tight font-bold tabular-nums">{parts.day}</span>
                </div>
                <h3
                  id={`day-${day.key}`}
                  class={cn(
                    "text-sm font-semibold first-letter:uppercase",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span class="sr-only">{day.label}</span>
                  <span aria-hidden="true">{nearby.has(day.key) ? day.label : parts.month}</span>
                </h3>
              </div>
              <ul class="flex flex-col gap-3 sm:gap-5">
                {#each day.entries as entry (`${entry.id}:${entry.season}:${entry.episode}`)}
                  <li><EpisodeCard {entry} /></li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>
