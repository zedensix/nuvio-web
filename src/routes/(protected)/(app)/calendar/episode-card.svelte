<script lang="ts">
	import TvIcon from "@lucide/svelte/icons/tv";
	import { m } from "#lib/i18n/index.js";
	import { airTime, type CalendarEntry } from "#lib/library/calendar.js";
	import { resolve } from "$app/paths";

	let { entry }: { entry: CalendarEntry } = $props();

	const time = $derived(airTime(entry.airsAt));
	// Addons list stills for episodes that haven't aired yet and 404 them.
	let stillFailed = $state(false);
	const still = $derived(stillFailed ? null : entry.still);
</script>

<!-- A row on a phone, a still-first card from `sm` up. -->
<a
  href={resolve(`detail/series/${encodeURIComponent(entry.id)}`)}
  data-sveltekit-preload-data="hover"
  class="group flex items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-muted/60 sm:flex-col sm:items-stretch sm:gap-2.5 sm:p-0 sm:hover:bg-transparent"
>
  <div
    class="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border transition duration-300 sm:w-full sm:group-hover:-translate-y-0.5 sm:group-hover:shadow-[0_18px_40px_-18px] sm:group-hover:shadow-black/60 sm:group-hover:ring-primary/60 dark:ring-white/10"
  >
    {#if still}
      <img
        src={still}
        alt=""
        loading="lazy"
        decoding="async"
        onerror={() => (stillFailed = true)}
        class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    {:else if entry.poster}
      <img
        src={entry.poster}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        class="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-xl"
      />
      <img
        src={entry.poster}
        alt=""
        loading="lazy"
        decoding="async"
        class="relative mx-auto h-full object-contain"
      />
    {:else}
      <div class="flex size-full items-center justify-center">
        <TvIcon class="size-6 text-muted-foreground/50" />
      </div>
    {/if}
    <span
      class="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-md"
    >
      {m.media_episode_prefix({ season: entry.season, episode: entry.episode })}
    </span>
    {#if time}
      <span
        class="absolute top-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums backdrop-blur-md"
      >
        {time}
      </span>
    {/if}
  </div>
  <div class="flex min-w-0 items-center gap-2.5 sm:px-0.5">
    {#if still && entry.poster}
      <img
        src={entry.poster}
        alt=""
        loading="lazy"
        decoding="async"
        class="hidden aspect-2/3 w-8 shrink-0 rounded-md object-cover ring-1 ring-border sm:block dark:ring-white/10"
      />
    {/if}
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold">{entry.name}</p>
      <p class="truncate text-xs text-muted-foreground">
        {entry.title ?? m.media_episode_prefix({ season: entry.season, episode: entry.episode })}
      </p>
    </div>
  </div>
</a>
