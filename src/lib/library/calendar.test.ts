import { describe, expect, it } from "vitest";
import {
	airTime,
	type CalendarEntry,
	dayLabel,
	groupByDay,
	hasNewEpisode,
	monthGrid,
	monthWindow,
	parseMonth,
	recentWindow,
	seriesEpisodes,
	shiftMonth,
	untilLabel,
	weekStart,
} from "./calendar.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");

function video(season: number, episode: number, released?: string) {
	return {
		id: `tt1:${season}:${episode}`,
		title: `E${episode}`,
		season,
		episode,
		released,
	};
}

function entry(airsAt: string, over: Partial<CalendarEntry> = {}) {
	return {
		id: "tt1",
		name: "Show",
		poster: null,
		still: null,
		season: 1,
		episode: 1,
		title: null,
		airsAt,
		...over,
	};
}

describe("seriesEpisodes", () => {
	it("keeps real dated episodes from the last week onwards", () => {
		const episodes = seriesEpisodes(
			[
				video(1, 1, "2026-10-01T00:00:00Z"),
				video(1, 2, "2026-10-28T00:00:00Z"),
				video(1, 3, "2026-11-04T00:00:00Z"),
				video(1, 4),
				video(0, 1, "2026-11-03T00:00:00Z"),
			],
			null,
			recentWindow(NOW),
		);
		expect(episodes.map((episode) => episode.episode)).toEqual([2, 3]);
		expect(episodes[1]).toEqual({
			season: 1,
			episode: 3,
			title: "E3",
			airsAt: "2026-11-04T00:00:00.000Z",
			still: null,
		});
	});

	it("adds the schedule's next airing unless the meta already lists it", () => {
		const next = {
			season: 2,
			episode: 1,
			title: null,
			airsAt: "2026-11-10T01:00:00.000Z",
		};
		expect(seriesEpisodes([], next, recentWindow(NOW))).toEqual([
			{ ...next, still: null },
		]);
		expect(
			seriesEpisodes(
				[video(2, 1, "2026-11-10T00:00:00Z")],
				next,
				recentWindow(NOW),
			),
		).toHaveLength(1);
	});

	it("drops duplicate episode numbers", () => {
		expect(
			seriesEpisodes(
				[
					video(1, 2, "2026-11-03T00:00:00Z"),
					video(1, 2, "2026-11-03T00:00:00Z"),
				],
				null,
				recentWindow(NOW),
			),
		).toHaveLength(1);
	});
});

describe("hasNewEpisode", () => {
	const videos = [
		video(1, 1, "2026-10-01T00:00:00Z"),
		video(1, 2, "2026-10-30T00:00:00Z"),
		video(1, 3, "2026-11-09T00:00:00Z"),
	];

	it("flags an unwatched episode out in the last week", () => {
		expect(hasNewEpisode(videos, new Set(), NOW)).toBe(true);
	});

	it("ignores a watched one, an old one and one not out yet", () => {
		expect(hasNewEpisode(videos, new Set(["tt1:1:2"]), NOW)).toBe(false);
		expect(hasNewEpisode([videos[0], videos[2]], new Set(), NOW)).toBe(false);
	});
});

describe("dayLabel", () => {
	const label = (key: string) => dayLabel(key, NOW, "en-US", "UTC");

	it("names today, tomorrow and yesterday", () => {
		expect(label("2026-11-02")).toBe("Today");
		expect(label("2026-11-03")).toBe("Tomorrow");
		expect(label("2026-11-01")).toBe("Yesterday");
	});

	it("spells out the weekday and date, with the year only when not this one", () => {
		expect(label("2026-11-05")).toBe("Thursday, November 5");
		expect(label("2027-01-04")).toBe("Monday, January 4, 2027");
	});

	it("formats in the viewer's locale", () => {
		expect(dayLabel("2026-11-05", NOW, "fr-FR", "UTC")).toBe(
			"jeudi 5 novembre",
		);
	});
});

describe("groupByDay", () => {
	it("splits upcoming (oldest first) from the past week (newest first)", () => {
		const grouped = groupByDay(
			[
				entry("2026-11-05T20:00:00Z", { episode: 4 }),
				entry("2026-10-30T20:00:00Z", { episode: 1 }),
				entry("2026-11-02T01:00:00Z", { episode: 2 }),
				entry("2026-11-01T20:00:00Z", { episode: 3 }),
			],
			NOW,
			"en-US",
			"UTC",
		);
		expect(grouped.upcoming.map((day) => day.key)).toEqual([
			"2026-11-02",
			"2026-11-05",
		]);
		expect(grouped.recent.map((day) => day.label)).toEqual([
			"Yesterday",
			"Friday, October 30",
		]);
	});

	it("groups by calendar day in the viewer's time zone", () => {
		const late = entry("2026-11-03T02:00:00Z");
		expect(groupByDay([late], NOW, "en-US", "UTC").upcoming[0].label).toBe(
			"Tomorrow",
		);
		expect(
			groupByDay([late], NOW, "en-US", "America/New_York").upcoming[0].label,
		).toBe("Today");
	});

	it("orders one day's entries by time, then name", () => {
		const [today] = groupByDay(
			[
				entry("2026-11-02T22:00:00Z", { name: "Late" }),
				entry("2026-11-02T18:00:00Z", { name: "Zed" }),
				entry("2026-11-02T18:00:00Z", { name: "Alpha" }),
			],
			NOW,
			"en-US",
			"UTC",
		).upcoming;
		expect(today.entries.map((item) => item.name)).toEqual([
			"Alpha",
			"Zed",
			"Late",
		]);
	});
});

describe("month view", () => {
	it("reads a YYYY-MM from the URL and nothing else", () => {
		expect(parseMonth("2026-11")).toBe("2026-11");
		expect(parseMonth("2026-13")).toBeNull();
		expect(parseMonth("26-11")).toBeNull();
		expect(parseMonth(null)).toBeNull();
	});

	it("moves across years", () => {
		expect(shiftMonth("2026-12", 1)).toBe("2027-01");
		expect(shiftMonth("2026-01", -1)).toBe("2025-12");
	});

	it("asks for the weeks either side the grid shows", () => {
		const { from, to } = monthWindow("2026-11");
		expect(new Date(from).toISOString()).toBe("2026-10-24T00:00:00.000Z");
		expect(new Date(to).toISOString()).toBe("2026-12-16T00:00:00.000Z");
	});

	it("starts the week on Sunday in English and Monday in French", () => {
		expect([0, 1]).toContain(weekStart("en-US"));
		expect(weekStart("fr")).toBe(1);
		expect(weekStart("not a locale!")).toBe(1);
	});

	it("lays the month out in whole weeks with each day's episodes", () => {
		const weeks = monthGrid(
			"2026-11",
			[
				entry("2026-11-04T20:00:00Z", { episode: 2 }),
				entry("2026-11-04T01:00:00Z", { episode: 1 }),
				entry("2026-12-01T01:00:00Z", { episode: 3 }),
			],
			1,
			"UTC",
		);
		// 1 November 2026 is a Sunday: a Monday-first grid opens on 26 October.
		expect(weeks[0][0]).toMatchObject({
			key: "2026-10-26",
			day: 26,
			inMonth: false,
		});
		expect(weeks.every((week) => week.length === 7)).toBe(true);
		expect(weeks).toHaveLength(6);
		const fourth = weeks.flat().find((cell) => cell.key === "2026-11-04");
		expect(fourth?.entries.map((item) => item.episode)).toEqual([1, 2]);
		const spill = weeks.flat().find((cell) => cell.key === "2026-12-01");
		expect(spill).toMatchObject({ inMonth: false });
		expect(spill?.entries).toHaveLength(1);

		const sundayFirst = monthGrid("2026-11", [], 0, "UTC");
		expect(sundayFirst[0][0].key).toBe("2026-11-01");
		expect(sundayFirst).toHaveLength(5);
	});
});

describe("air times", () => {
	it("gives a time only when the listing has one", () => {
		expect(airTime("2026-11-04T00:00:00.000Z", "en-GB", "UTC")).toBeNull();
		expect(airTime("2026-11-04T20:30:00.000Z", "en-GB", "UTC")).toBe("20:30");
	});

	it("counts hours on the day, days after", () => {
		expect(untilLabel("2026-11-02T15:00:00.000Z", NOW, "en", "UTC")).toBe(
			"in 3 hours",
		);
		expect(untilLabel("2026-11-03T00:00:00.000Z", NOW, "en", "UTC")).toBe(
			"tomorrow",
		);
		expect(untilLabel("2026-11-07T20:00:00.000Z", NOW, "en", "UTC")).toBe(
			"in 5 days",
		);
	});
});
