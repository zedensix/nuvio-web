import type { Meta } from "#lib/addons/index.js";
import { getLocale, m } from "#lib/i18n/index.js";
import type { UpcomingEpisode } from "#lib/watch/episodes.js";

type Videos = NonNullable<Meta["videos"]>;

const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;

/** An episode with its still, when the addon has one. */
export interface CalendarEpisode extends UpcomingEpisode {
	still: string | null;
}

export interface CalendarEntry extends CalendarEpisode {
	id: string;
	name: string;
	poster: string | null;
}

/** The air dates a calendar view asks for: `from` included, `to` not (ms). */
export interface CalendarWindow {
	from: number;
	to: number;
}

/** The list view: the past week, and everything still to come. */
export function recentWindow(now = Date.now()): CalendarWindow {
	return { from: now - RECENT_DAYS * DAY_MS, to: Number.POSITIVE_INFINITY };
}

export interface CalendarDay {
	key: string;
	label: string;
	entries: CalendarEntry[];
}

// Dated episodes inside the window, plus the schedule's next airing when the meta does not list it.
export function seriesEpisodes(
	videos: Videos | undefined,
	next: UpcomingEpisode | null,
	window: CalendarWindow = recentWindow(),
): CalendarEpisode[] {
	const inside = (at: number) => at >= window.from && at < window.to;
	const episodes: CalendarEpisode[] = [];
	for (const video of videos ?? []) {
		const at = video.released ? Date.parse(video.released) : Number.NaN;
		if (
			(video.season ?? 0) > 0 &&
			(video.episode ?? 0) > 0 &&
			inside(at) &&
			!episodes.some(
				(known) =>
					known.season === video.season && known.episode === video.episode,
			)
		) {
			episodes.push({
				season: video.season ?? 0,
				episode: video.episode ?? 0,
				title: video.title?.trim() || null,
				airsAt: new Date(at).toISOString(),
				still: video.thumbnail || null,
			});
		}
	}
	if (
		next &&
		inside(Date.parse(next.airsAt)) &&
		!episodes.some(
			(known) => known.season === next.season && known.episode === next.episode,
		)
	) {
		episodes.push({ ...next, still: null });
	}
	return episodes;
}

// Whether an episode came out in the last week that none of the watched video ids covers.
export function hasNewEpisode(
	videos: Videos | undefined,
	watched: ReadonlySet<string>,
	now = Date.now(),
): boolean {
	const since = now - RECENT_DAYS * DAY_MS;
	return (videos ?? []).some((video) => {
		const at = video.released ? Date.parse(video.released) : Number.NaN;
		return (
			(video.season ?? 0) > 0 &&
			(video.episode ?? 0) > 0 &&
			at >= since &&
			at <= now &&
			!watched.has(video.id)
		);
	});
}

/** `YYYY-MM-DD` of `at` in `timeZone` (the runtime's own by default). */
export function dayKey(at: number, timeZone?: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(at);
}

export function dayLabel(
	key: string,
	now = Date.now(),
	locale: string = getLocale(),
	timeZone?: string,
): string {
	const days = Math.round(
		(Date.parse(key) - Date.parse(dayKey(now, timeZone))) / DAY_MS,
	);
	if (days === 0) {
		return m.calendar_today();
	}
	if (days === 1) {
		return m.calendar_tomorrow();
	}
	if (days === -1) {
		return m.calendar_yesterday();
	}
	const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
	return new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		weekday: "long",
		month: "long",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	}).format(Date.parse(key));
}

function byDay(
	entries: readonly CalendarEntry[],
	timeZone?: string,
): Map<string, CalendarEntry[]> {
	const days = new Map<string, CalendarEntry[]>();
	const sorted = [...entries].sort(
		(a, b) =>
			Date.parse(a.airsAt) - Date.parse(b.airsAt) ||
			a.name.localeCompare(b.name) ||
			a.season - b.season ||
			a.episode - b.episode,
	);
	for (const entry of sorted) {
		const key = dayKey(Date.parse(entry.airsAt), timeZone);
		days.set(key, [...(days.get(key) ?? []), entry]);
	}
	return days;
}

// Calendar days in the viewer's time zone: today onwards first, then the past week newest first.
export function groupByDay(
	entries: readonly CalendarEntry[],
	now = Date.now(),
	locale: string = getLocale(),
	timeZone?: string,
): { upcoming: CalendarDay[]; recent: CalendarDay[] } {
	const today = dayKey(now, timeZone);
	const days = byDay(entries, timeZone);
	const all = [...days].map(([key, dayEntries]) => ({
		key,
		label: dayLabel(key, now, locale, timeZone),
		entries: dayEntries,
	}));
	return {
		upcoming: all.filter((day) => day.key >= today),
		recent: all.filter((day) => day.key < today).reverse(),
	};
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A `YYYY-MM` from the URL, or `null` when it isn't one. */
export function parseMonth(value: string | null): string | null {
	return value && MONTH_PATTERN.test(value) ? value : null;
}

function monthStart(month: string): number {
	const [year, index] = month.split("-").map(Number);
	return Date.UTC(year, index - 1, 1);
}

/** `month` moved by `delta` months, as `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
	const at = new Date(monthStart(month));
	at.setUTCMonth(at.getUTCMonth() + delta);
	return at.toISOString().slice(0, 7);
}

/**
 * The month view's air dates: the month, plus the days of the weeks either
 * side its grid shows, plus a day of slack for the viewer's time zone.
 */
export function monthWindow(month: string): CalendarWindow {
	return {
		from: monthStart(month) - 8 * DAY_MS,
		to: monthStart(shiftMonth(month, 1)) + 15 * DAY_MS,
	};
}

/** The weekday a week starts on in `locale`: 0 is Sunday, 1 Monday. */
export function weekStart(locale: string): number {
	try {
		const info = new Intl.Locale(locale) as Intl.Locale & {
			getWeekInfo?: () => { firstDay: number };
			weekInfo?: { firstDay: number };
		};
		return (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay === 7 ? 0 : 1;
	} catch {
		return 1;
	}
}

export interface MonthCell {
	key: string;
	day: number;
	inMonth: boolean;
	entries: CalendarEntry[];
}

/** The month as weeks of seven days, each day with what airs on it in `timeZone`. */
export function monthGrid(
	month: string,
	entries: readonly CalendarEntry[],
	firstWeekday: number,
	timeZone?: string,
): MonthCell[][] {
	const first = monthStart(month);
	const offset = (new Date(first).getUTCDay() - firstWeekday + 7) % 7;
	const length = (monthStart(shiftMonth(month, 1)) - first) / DAY_MS;
	const days = byDay(entries, timeZone);
	const weeks: MonthCell[][] = [];
	for (let index = 0; index < Math.ceil((offset + length) / 7) * 7; index++) {
		const at = new Date(first + (index - offset) * DAY_MS);
		const key = at.toISOString().slice(0, 10);
		if (index % 7 === 0) {
			weeks.push([]);
		}
		weeks[weeks.length - 1].push({
			key,
			day: at.getUTCDate(),
			inMonth: key.startsWith(month),
			entries: days.get(key) ?? [],
		});
	}
	return weeks;
}

/**
 * The local time an episode airs, or `null` for a bare date: addons list most
 * episodes at midnight UTC, which is a day, not a time.
 */
export function airTime(
	airsAt: string,
	locale: string = getLocale(),
	timeZone?: string,
): string | null {
	if (airsAt.endsWith("T00:00:00.000Z")) {
		return null;
	}
	return new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "2-digit",
		timeZone,
	}).format(Date.parse(airsAt));
}

/** "in 3 hours", "tomorrow", "in 5 days": how far off an airing is. */
export function untilLabel(
	airsAt: string,
	now = Date.now(),
	locale: string = getLocale(),
	timeZone?: string,
): string {
	const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const at = Date.parse(airsAt);
	const days = Math.round(
		(Date.parse(dayKey(at, timeZone)) - Date.parse(dayKey(now, timeZone))) /
			DAY_MS,
	);
	if (days === 0 && at > now && airTime(airsAt, locale, timeZone)) {
		return format.format(Math.ceil((at - now) / 3_600_000), "hour");
	}
	return format.format(days, "day");
}
