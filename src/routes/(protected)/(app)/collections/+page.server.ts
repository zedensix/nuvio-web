import { pullCollections } from "#lib/collections/collections-data.js";
import { CACHE } from "#lib/services/index.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => ({
	collections: pullCollections(
		locals.nuvio.withFetch(fetch),
		locals.services.get(CACHE),
		locals.session?.accountKey,
		locals.profileId ?? 0,
	),
});
