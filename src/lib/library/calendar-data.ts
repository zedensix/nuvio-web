import type { Meta } from "#lib/addons/index.js";
import { pooledMap } from "#lib/core/pool.js";
import type { HistoryRecord, LibraryRecord } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";
import type { UpcomingEpisode } from "#lib/watch/episodes.js";
import { titleProgressFor } from "#lib/watch/playback-context.js";
import { type MetaLookup, pullNextToAir } from "#lib/watch/watch-data.js";
import {
	type CalendarEntry,
	type CalendarWindow,
	hasNewEpisode,
	seriesEpisodes,
} from "./calendar.ts";

// Same cap as continue watching: each lookup fans out to every meta addon.
const SERIES_CONCURRENCY = 4;

async function librarySeries(
	data: ProfileData,
	lookupMeta: MetaLookup,
): Promise<{ item: LibraryRecord; meta: Meta | null }[]> {
	const library = await data.library().catch(() => []);
	return await pooledMap(
		library.filter((item) => item.contentType === "series"),
		SERIES_CONCURRENCY,
		async (item) => ({
			item,
			meta: await lookupMeta("series", item.contentId).catch(() => null),
		}),
	);
}

/** What the library's series air inside `window`. */
export async function pullCalendar(
	data: ProfileData,
	lookupMeta: MetaLookup,
	window: CalendarWindow,
	nextToAir: (meta: Meta) => Promise<UpcomingEpisode | null> = pullNextToAir,
): Promise<CalendarEntry[]> {
	const series = await librarySeries(data, lookupMeta);
	const perSeries = await pooledMap(
		series,
		SERIES_CONCURRENCY,
		async ({ item, meta }) => {
			if (!meta) {
				return [];
			}
			const next = await nextToAir(meta).catch(() => null);
			return seriesEpisodes(meta.videos, next, window).map((episode) => ({
				...episode,
				id: item.contentId,
				name: meta.name || item.name,
				poster: meta.poster ?? item.poster,
				still: episode.still ?? meta.background ?? item.background,
			}));
		},
	);
	return perSeries.flat();
}

function watchedVideoIds(
	id: string,
	meta: Meta,
	progress: Awaited<ReturnType<ProfileData["progress"]>>,
	history: readonly HistoryRecord[],
): Set<string> {
	return new Set(
		Object.keys(
			titleProgressFor(progress, "series", id, {
				videos: meta.videos,
				history,
			}),
		),
	);
}

// Library series ids with an episode out in the last week the profile has not watched.
export async function pullNewEpisodes(
	data: ProfileData,
	lookupMeta: MetaLookup,
	now = Date.now(),
): Promise<string[]> {
	const [series, progress, history] = await Promise.all([
		librarySeries(data, lookupMeta),
		data.progress().catch(() => []),
		data.history().catch(() => []),
	]);
	return series
		.filter(
			({ item, meta }) =>
				meta &&
				hasNewEpisode(
					meta.videos,
					watchedVideoIds(item.contentId, meta, progress, history),
					now,
				),
		)
		.map(({ item }) => item.contentId);
}
