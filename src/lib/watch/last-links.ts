import * as v from "valibot";
import type { Cache } from "#lib/services/cache.service.js";

/** The longest "reuse last link" keeps a link (`linkCacheDays`' maximum). */
const KEEP_MS = 30 * 86_400_000;

const text = v.pipe(v.string(), v.maxLength(4096));
const nullableText = v.nullable(text);

/** A stream that played, as the player's `SelectedStream` has it. */
export const lastLinkSchema = v.object({
	videoId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(256)),
	url: nullableText,
	externalUrl: nullableText,
	notWebReady: v.boolean(),
	label: text,
	addonName: text,
	infoHash: nullableText,
	audioRisky: v.boolean(),
	videoRisky: v.boolean(),
	videoCodec: nullableText,
	bingeGroup: v.optional(nullableText),
	requestHeaders: v.optional(
		v.pipe(
			v.record(v.pipe(v.string(), v.maxLength(256)), text),
			v.maxEntries(32),
		),
	),
	debridDownload: v.optional(v.boolean()),
});

export type LastLink = v.InferOutput<typeof lastLinkSchema> & {
	resolvedAt: number;
};

/** Whose link it is: the same id means another title on another profile. */
export interface LinkOwner {
	accountKey: string;
	profileId: number;
}

function linkKey(owner: LinkOwner, videoId: string): string {
	return `link:${owner.accountKey}:${owner.profileId}:${videoId}`;
}

/**
 * The stream that last played `videoId` for this profile, on any device, so
 * "reuse last link" works across them. A debrid link expires, which is why
 * the reader still checks `resolvedAt` against its own `linkCacheDays`.
 */
export async function readLastLink(
	cache: Cache,
	owner: LinkOwner,
	videoId: string,
): Promise<LastLink | null> {
	return (await cache.get<LastLink>(linkKey(owner, videoId))) ?? null;
}

export async function writeLastLink(
	cache: Cache,
	owner: LinkOwner,
	stream: v.InferOutput<typeof lastLinkSchema>,
): Promise<void> {
	await cache.set(
		linkKey(owner, stream.videoId),
		{ ...stream, resolvedAt: Date.now() },
		KEEP_MS,
	);
}
