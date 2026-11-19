import type { HomeRow } from "#lib/addons/catalog-queries.js";
import type { ResumeRow } from "#lib/watch/watch-data.js";
import { browser } from "$app/env";

/**
 * The last home feed this device showed, in `localStorage`, so the next visit
 * paints it right after hydration while the fresh rows stream in, before the
 * server has even started on them.
 *
 * Scoped per owner (`<userId>:<profileId>`, see `syncOwner`), and dropped on
 * sign-out with the rest of the device's data (`forgetLocalData`). All storage
 * access is guarded: private windows and blocked site data throw.
 */
const KEY_PREFIX = "nuvio:home";

export interface CachedHome {
	rows: HomeRow[];
	resume: ResumeRow[];
}

export function readHomeCache(owner: string): CachedHome | null {
	if (!browser) {
		return null;
	}
	try {
		const parsed = JSON.parse(
			localStorage.getItem(`${KEY_PREFIX}:${owner}`) ?? "null",
		);
		return Array.isArray(parsed?.rows) && Array.isArray(parsed?.resume)
			? parsed
			: null;
	} catch {
		return null;
	}
}

export function writeHomeCache(owner: string, home: CachedHome): void {
	try {
		localStorage.setItem(`${KEY_PREFIX}:${owner}`, JSON.stringify(home));
	} catch {
		// no-op : storage unavailable or full
	}
}

export function forgetHomeCaches(): void {
	if (!browser) {
		return;
	}
	try {
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith(`${KEY_PREFIX}:`)) {
				localStorage.removeItem(key);
			}
		}
	} catch {
		// no-op : storage unavailable
	}
}
