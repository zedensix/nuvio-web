<script lang="ts">
	import HouseIcon from "@lucide/svelte/icons/house";
	import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";
	import XIcon from "@lucide/svelte/icons/x";
	import { fly } from "svelte/transition";
	import { Button } from "#lib/components/ui/button/index.js";
	import { reduced } from "#lib/core/motion.js";
	import { m } from "#lib/i18n/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { resolve } from "$app/paths";

	let {
		next,
		seconds,
		onNext,
		onDismiss,
	}: {
		next: {
			season: number;
			episode: number;
			title: string;
			overview: string | null;
			thumbnail: string | null;
		};
		/** Countdown before `onNext` fires on its own; `null` when autoplay is off. */
		seconds: number | null;
		onNext: () => void;
		onDismiss: () => void;
	} = $props();

	let remaining = $state(0);

	$effect(() => {
		if (seconds == null) {
			return;
		}
		const deadline = Date.now() + seconds * 1000;
		remaining = seconds;
		const timer = setInterval(() => {
			remaining = Math.ceil((deadline - Date.now()) / 1000);
			if (remaining <= 0) {
				clearInterval(timer);
				onNext();
			}
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<!-- `data-accent` mirrors the accent onto this forced-`.dark` scope, as in end-panel. -->
<section
  aria-label={m.watch_up_next()}
  data-accent={theme.current.accent}
  class="dark absolute right-4 bottom-32 left-4 z-30 flex flex-col gap-3 rounded-3xl bg-linear-to-b from-white/12 to-black/60 p-3.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 sm:right-6 sm:bottom-36 sm:left-auto sm:w-104"
  transition:fly={reduced({ x: 32, duration: 260 })}
>
  <div class="flex gap-3">
    {#if next.thumbnail}
      <img
        src={next.thumbnail}
        alt=""
        class="aspect-video w-36 shrink-0 self-start rounded-xl object-cover ring-1 ring-white/15"
      />
    {/if}
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-start gap-2">
        <p class="min-w-0 flex-1 text-[0.7rem] font-semibold tracking-[0.18em] text-white/60 uppercase">
          {m.watch_up_next()} · {m.media_episode_prefix({ season: next.season, episode: next.episode })}
        </p>
        <button
          type="button"
          onclick={onDismiss}
          aria-label={m.watch_not_now()}
          class="-mt-1 -mr-1 rounded-full p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <XIcon class="size-4" />
        </button>
      </div>
      <h2 class="line-clamp-2 text-sm leading-snug font-semibold">{next.title}</h2>
      {#if next.overview}
        <p class="line-clamp-3 text-xs leading-relaxed text-white/65">{next.overview}</p>
      {/if}
    </div>
  </div>

  {#if seconds != null}
    <div class="flex flex-col gap-1.5">
      <div class="h-1 overflow-hidden rounded-full bg-white/15">
        <div
          class="up-next-fill h-full origin-left rounded-full bg-primary"
          style:animation-duration="{seconds}s"
        ></div>
      </div>
      <p class="text-xs font-medium tabular-nums text-white/70">
        {m.player_up_next_playing_in({ seconds: Math.max(remaining, 0) })}
      </p>
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <Button class="flex-1" onclick={onNext}>
      <SkipForwardIcon data-icon="inline-start" class="fill-current" />
      {m.watch_play_next_episode()}
    </Button>
    <Button variant="secondary" href={resolve("/(protected)/(app)")}>
      <HouseIcon data-icon="inline-start" /> {m.nav_home()}
    </Button>
  </div>
</section>

<style>
  .up-next-fill {
    animation-name: up-next-fill;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes up-next-fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
</style>
