import { describe, expect, it } from "vitest";
import type { Meta } from "#lib/addons/index.js";
import type {
	HistoryRecord,
	LibraryRecord,
	ProgressRecord,
} from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";
import { recentWindow } from "./calendar.ts";
import { pullCalendar, pullNewEpisodes } from "./calendar-data.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");

function saved(contentId: string, contentType: "movie" | "series") {
	return {
		contentId,
		contentType,
		name: contentId,
		poster: null,
		background: null,
		description: null,
		releaseInfo: null,
		imdbRating: null,
		genres: [],
		addedAt: 1,
	} satisfies LibraryRecord;
}

function data(over: Partial<ProfileData> = {}): ProfileData {
	return {
		library: async () => [
			saved("tt1", "series"),
			saved("tt2", "series"),
			saved("tt3", "movie"),
		],
		progress: async () => [],
		history: async () => [],
		historyPage: async () => ({ records: [], total: 0, page: 1, pageCount: 1 }),
		historyOf: async () => [],
		...over,
	};
}

const metas: Record<string, Meta> = {
	tt1: {
		id: "tt1",
		type: "series",
		name: "One",
		poster: "p1",
		videos: [
			{
				id: "tt1:1:1",
				title: "a",
				season: 1,
				episode: 1,
				released: "2026-10-31T00:00:00Z",
			},
			{
				id: "tt1:1:2",
				title: "b",
				season: 1,
				episode: 2,
				released: "2026-11-07T00:00:00Z",
				thumbnail: "still-2",
			},
		],
	},
};

const lookup = async (_type: string, id: string) => {
	if (id === "tt2") {
		throw new Error("addon down");
	}
	return metas[id] ?? null;
};

describe("pullCalendar", () => {
	it("lists the library's series episodes and skips a series whose lookup fails", async () => {
		const entries = await pullCalendar(
			data(),
			lookup,
			recentWindow(NOW),
			async () => null,
		);
		expect(entries.map((item) => [item.id, item.name, item.episode])).toEqual([
			["tt1", "One", 1],
			["tt1", "One", 2],
		]);
	});

	it("uses the episode's still, else the series backdrop, and only the window's dates", async () => {
		const withBackdrop = async (type: string, id: string) =>
			id === "tt1" ? { ...metas.tt1, background: "bg" } : lookup(type, id);
		const entries = await pullCalendar(
			data(),
			withBackdrop,
			{
				from: Date.parse("2026-11-01T00:00:00Z"),
				to: Date.parse("2026-12-01T00:00:00Z"),
			},
			async () => null,
		);
		expect(entries.map((item) => [item.episode, item.still])).toEqual([
			[2, "still-2"],
		]);
		const both = await pullCalendar(
			data(),
			withBackdrop,
			recentWindow(NOW),
			async () => null,
		);
		expect(both.map((item) => item.still)).toEqual(["bg", "still-2"]);
	});

	it("degrades to empty when the library read fails", async () => {
		const failing = data({
			library: async () => {
				throw new Error("down");
			},
		});
		expect(
			await pullCalendar(failing, lookup, recentWindow(NOW), async () => null),
		).toEqual([]);
	});
});

describe("pullNewEpisodes", () => {
	it("flags a series with an unwatched episode from the last week", async () => {
		expect(await pullNewEpisodes(data(), lookup, NOW)).toEqual(["tt1"]);
	});

	it("drops it once progress or history covers that episode", async () => {
		const progress = async () => [
			{
				contentId: "tt1",
				videoId: "tt1:1:1",
				season: 1,
				episode: 1,
				position: 3_000_000,
				duration: 3_000_000,
			} as ProgressRecord,
		];
		expect(await pullNewEpisodes(data({ progress }), lookup, NOW)).toEqual([]);

		const history = async () => [
			{ contentId: "tt1", season: 1, episode: 1 } as HistoryRecord,
		];
		expect(await pullNewEpisodes(data({ history }), lookup, NOW)).toEqual([]);
	});
});
