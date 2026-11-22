import { crossedIntoCredits } from "#lib/player/segments.js";
import type { PlayerTransportState } from "./transport-state.svelte.ts";

/**
 * The two "react to a position in the timeline" concerns: showing (and
 * acting on) "Skip intro" while inside the intro window, and firing
 * `onOutro` each time playback runs into the credits.
 */
export function createPlaybackMilestones(deps: {
	transport: PlayerTransportState;
	/** Seeks to `time` and plays : the `<video>`, or mpv. */
	skipTo: (time: number) => void;
	minimized: () => boolean;
	fatalError: () => boolean;
	introStart: () => number | null;
	introEnd: () => number | null;
	outroStart: () => number | null;
	autoSkip: () => boolean;
	onOutro?: () => void;
}) {
	let lastTime: number | null = null;
	let introSkipped = false;

	const showSkipIntro = $derived(
		deps.introEnd() != null &&
			!deps.minimized() &&
			!deps.fatalError() &&
			deps.transport.currentTime >= (deps.introStart() ?? 0) &&
			deps.transport.currentTime < (deps.introEnd() as number) - 1,
	);

	function skipIntro() {
		const introEnd = deps.introEnd();
		if (introEnd != null) {
			deps.skipTo(introEnd);
		}
	}

	// Once per source, so seeking back into the intro on purpose stays there.
	$effect(() => {
		if (
			showSkipIntro &&
			!introSkipped &&
			deps.autoSkip() &&
			!deps.transport.paused &&
			!deps.transport.loading
		) {
			introSkipped = true;
			skipIntro();
		}
	});

	// Fire `onOutro` each time playback runs into the credits.
	$effect(() => {
		const time = deps.transport.currentTime;
		const previous = lastTime;
		lastTime = time;
		const outroStart = deps.outroStart();
		if (
			previous !== null &&
			outroStart != null &&
			crossedIntoCredits(previous, time, outroStart, deps.transport.duration)
		) {
			deps.onOutro?.();
		}
	});

	function reset() {
		lastTime = null;
		introSkipped = false;
	}

	return {
		get showSkipIntro() {
			return showSkipIntro;
		},
		skipIntro,
		reset,
	};
}
