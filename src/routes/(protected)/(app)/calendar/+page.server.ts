import { titleMeta } from "#lib/addons/server.js";
import {
	monthWindow,
	parseMonth,
	recentWindow,
} from "#lib/library/calendar.js";
import { pullCalendar } from "#lib/library/calendar-data.js";
import { CACHE } from "#lib/services/index.js";
import { profileData } from "#lib/userdata/server.js";
import { pullNextToAir } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

// The view and the month live in the URL, so a reload or a shared link lands on
// the same page. Nothing is awaited: the entries stream in behind a skeleton.
export const load: PageServerLoad = ({ locals, fetch, url }) => {
	const view = url.searchParams.get("view") === "month" ? "month" : "list";
	const month =
		parseMonth(url.searchParams.get("month")) ??
		new Date().toISOString().slice(0, 7);
	const cache = locals.services.get(CACHE);
	const lookupMeta = async (type: string, id: string) =>
		(await titleMeta(type, id))?.meta ?? null;
	return {
		view,
		month,
		entries: pullCalendar(
			profileData(locals, fetch),
			lookupMeta,
			view === "month" ? monthWindow(month) : recentWindow(),
			(meta) => pullNextToAir(meta, { cache }),
		).catch(() => []),
	};
};
