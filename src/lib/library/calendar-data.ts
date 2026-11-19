import type { Meta } from "#lib/addons/index.js";
import { pooledMap } from "#lib/core/pool.js";
import type { LibraryRecord } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";
import type { UpcomingEpisode } from "#lib/watch/episodes.js";
import {
	titleProgressFor,
	watchedVideoIds,
} from "#lib/watch/playback-context.js";
import { type MetaLookup, pullNextToAir } from "#lib/watch/watch-data.js";
import {
	type CalendarEntry,
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

export async function pullCalendar(
	data: ProfileData,
	lookupMeta: MetaLookup,
	nextToAir: (meta: Meta) => Promise<UpcomingEpisode | null> = pullNextToAir,
	now = Date.now(),
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
			return seriesEpisodes(meta.videos, next, now).map((episode) => ({
				...episode,
				id: item.contentId,
				name: meta.name || item.name,
				poster: meta.poster ?? item.poster,
			}));
		},
	);
	return perSeries.flat();
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
					watchedVideoIds({
						progress: titleProgressFor(
							progress,
							"series",
							item.contentId,
							meta.videos ?? [],
						),
						history,
						type: "series",
						id: item.contentId,
						videos: meta.videos ?? [],
					}),
					now,
				),
		)
		.map(({ item }) => item.contentId);
}
