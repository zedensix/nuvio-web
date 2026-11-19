import { redirect } from "@sveltejs/kit";
import { httpUrlOrNull } from "#lib/core/url.js";
import { safeColor, toProfileView } from "#lib/nuvio/profile.js";
import { pullAvatars, pullProfiles } from "#lib/nuvio/profiles-data.js";
import { ADMIN, CACHE } from "#lib/services/index.js";
import { resolve } from "$app/paths";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url, fetch }) => {
	if (!locals.session) {
		const redirectTo = encodeURIComponent(url.pathname + url.search);
		redirect(303, `${resolve("auth/sign-in")}?redirectTo=${redirectTo}`);
	}

	const nuvio = locals.nuvio.withFetch(fetch);
	const cache = locals.services.get(CACHE);

	// The profile list is load-bearing (you can't pick a profile without it) so
	// this one is allowed to fail loudly : but it's still 12s-bounded, never a
	// hang. Avatars are cosmetic: fall back to initials. Both are cached, so a
	// warm page load waits on neither.
	const [profileList, avatarList] = await Promise.allSettled([
		pullProfiles(nuvio, cache, locals.session.accountKey),
		pullAvatars(nuvio, cache),
	]);
	if (profileList.status === "rejected") {
		throw profileList.reason;
	}
	const profiles = profileList.value;
	const avatars = avatarList.status === "fulfilled" ? avatarList.value : [];

	const catalog = new Map(avatars.map((entry) => [entry.id, entry]));

	return {
		user: locals.session.user,
		accountKey: locals.session.accountKey,
		// Drives the nav entry only : every admin route and remote function
		// checks server-side on its own.
		isAdmin: locals.services
			.get(ADMIN)
			.isAdmin(locals.session.user.email, locals.session.trusted),
		profileId: locals.profileId,
		profiles: profiles
			.sort((a, b) => a.profile_index - b.profile_index)
			.map((profile) =>
				toProfileView(profile, catalog, (path) => nuvio.avatarUrl(path)),
			),
		avatarCatalog: avatars
			.filter((entry) => entry.is_active)
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((entry) => ({
				id: entry.id,
				name: entry.display_name,
				url: httpUrlOrNull(nuvio.avatarUrl(entry.storage_path)),
				bgColor: safeColor(entry.bg_color),
			})),
	};
};
