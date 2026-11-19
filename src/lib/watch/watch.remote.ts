import * as v from "valibot";
import { getAddonClient, titleMeta } from "#lib/addons/server.js";
import { safeRequestHeaders } from "#lib/core/request-headers.js";
import { requireProfile } from "#lib/server/guards.js";
import { pinnedFetch } from "#lib/server/safe-fetch.js";
import { CACHE } from "#lib/services/index.js";
import { command, query } from "$app/server";
import { debridLinkStatus } from "./debrid-link.ts";
import { lastLinkSchema, writeLastLink } from "./last-links.ts";
import { pullPlaybackMeta, pullSubtitles, shapeStream } from "./watch-data.ts";

/**
 * A video's meta context (heading, art, episode tag) for the source drawer,
 * which opens on a user gesture for any video. The player page gets the same
 * payload from its load.
 */
export const playbackMeta = query(
	v.object({ type: v.string(), id: v.string() }),
	({ type, id }) => {
		requireProfile();
		return pullPlaybackMeta(
			{ type, id },
			async (metaType: string, metaId: string) =>
				(await titleMeta(metaType, metaId))?.meta ?? null,
		);
	},
);

/**
 * Fan out to every stream provider for this title. Slow and best-effort : called
 * from the client with `.current` (skeleton) and re-run by a "Refresh" button.
 * `fresh` asks the addons to skip their caches.
 */
export const resolveStreams = query(
	v.object({
		type: v.string(),
		id: v.string(),
		fresh: v.optional(v.boolean()),
	}),
	async ({ type, id, fresh }) => {
		const { client } = await getAddonClient();
		const { streams, errors } = await client.getStreams(type, id, fresh);
		return {
			streams: streams.map(shapeStream),
			errors: errors.map((entry) => ({
				addonName: entry.addonName,
				reason: entry.reason,
			})),
		};
	},
);

/**
 * Where a stream that is still to download on the addon's debrid service stands.
 * The player asks again until it is `ready`, then plays the same url.
 */
export const debridStatus = query(
	v.object({
		url: v.pipe(v.string(), v.url()),
		headers: v.optional(v.record(v.string(), v.string())),
	}),
	({ url, headers }) => {
		requireProfile();
		return debridLinkStatus(url, pinnedFetch, safeRequestHeaders(headers));
	},
);

export const getSubtitles = query(
	v.object({ type: v.string(), id: v.string() }),
	async (video) => pullSubtitles((await getAddonClient()).client, video),
);

/** Keeps the stream that just played, for "reuse last link" on any device. */
export const rememberLastLink = command(lastLinkSchema, async (stream) => {
	const { event, accountKey, profileId } = requireProfile();
	await writeLastLink(
		event.locals.services.get(CACHE),
		{ accountKey, profileId },
		stream,
	);
});
