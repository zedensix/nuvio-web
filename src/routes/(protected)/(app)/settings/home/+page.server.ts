import { listCatalogs } from "#lib/addons/server.js";
import { CACHE } from "#lib/services/index.js";
import { pullHomeLayout } from "#lib/settings/settings-data.js";
import type { PageServerLoad } from "./$types";

/**
 * Every catalog across the profile's addons, and the saved arrangement. Both
 * stream (unawaited) behind the section's own skeleton.
 */
export const load: PageServerLoad = ({ locals, fetch }) => ({
	layout: pullHomeLayout(
		locals.nuvio.withFetch(fetch),
		locals.services.get(CACHE),
		locals.session?.accountKey,
		locals.profileId ?? 0,
	),
	catalogs: listCatalogs().catch(() => []),
});
