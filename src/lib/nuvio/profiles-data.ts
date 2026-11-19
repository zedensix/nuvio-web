import type { Cache } from "#lib/services/cache.service.js";
import { forget, readThrough } from "#lib/services/read-through.js";
import type { NuvioClient } from "./client.ts";
import type { AvatarCatalogEntry, Profile } from "./types.ts";

const PROFILES_TTL_MS = 5 * 60_000;
const AVATARS_TTL_MS = 6 * 60 * 60_000;

function profilesKey(accountKey: string): string {
	return `profiles:${accountKey}`;
}

/**
 * The account's profiles, cached: the protected layout needs them before any
 * page ships. A rejection isn't kept and still rejects, since the layout can't
 * go on without them. The profile forms read Nuvio directly (a PIN set in
 * another client must hold there at once) and clear this after a write.
 */
export function pullProfiles(
	nuvio: NuvioClient,
	cache: Cache,
	accountKey: string,
): Promise<Profile[]> {
	return readThrough(
		cache,
		profilesKey(accountKey),
		PROFILES_TTL_MS,
		async () => ({
			value: await nuvio.profiles.list(),
			keep: true,
		}),
	);
}

export function forgetProfiles(
	cache: Cache,
	accountKey: string,
): Promise<void> {
	return forget(cache, profilesKey(accountKey));
}

/** Nuvio's avatar catalog: the same for everyone, and it barely changes. */
export function pullAvatars(
	nuvio: NuvioClient,
	cache: Cache,
): Promise<AvatarCatalogEntry[]> {
	return readThrough(cache, "avatars", AVATARS_TTL_MS, async () => ({
		value: await nuvio.listAvatars(),
		keep: true,
	}));
}
