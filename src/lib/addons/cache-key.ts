import { createHash } from "node:crypto";

/**
 * A cache key for an addon URL. Hashed: an addon's URL often carries its
 * user's configuration (a debrid key in the path), which has no business
 * showing up in a `KEYS *` on a shared Redis.
 */
export function addonCacheKey(kind: string, url: string): string {
	return `addon:${kind}:${createHash("sha256").update(url).digest("base64url")}`;
}
