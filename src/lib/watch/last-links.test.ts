import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { MemoryCache } from "#lib/services/cache.service.js";
import { lastLinkSchema, readLastLink, writeLastLink } from "./last-links.ts";

const stream = {
	videoId: "tt1:1:2",
	url: "https://debrid.example/file.mkv",
	externalUrl: null,
	notWebReady: false,
	label: "1080p",
	addonName: "Torrentio",
	infoHash: null,
	audioRisky: false,
	videoRisky: false,
	videoCodec: null,
};

describe("last links", () => {
	it("keeps the link per account and profile", async () => {
		const cache = new MemoryCache();
		const owner = { accountKey: "a", profileId: 1 };
		await writeLastLink(cache, owner, stream);
		expect(await readLastLink(cache, owner, "tt1:1:2")).toMatchObject({
			url: stream.url,
			resolvedAt: expect.any(Number),
		});
		expect(
			await readLastLink(cache, { ...owner, profileId: 2 }, "tt1:1:2"),
		).toBeNull();
		expect(
			await readLastLink(cache, { ...owner, accountKey: "b" }, "tt1:1:2"),
		).toBeNull();
	});

	it("drops what isn't a stream field and refuses oversized input", () => {
		const parsed = v.parse(lastLinkSchema, { ...stream, extra: "x" });
		expect(parsed).not.toHaveProperty("extra");
		expect(
			v.safeParse(lastLinkSchema, { ...stream, label: "x".repeat(5000) })
				.success,
		).toBe(false);
	});
});
