import { describe, expect, it, vi } from "vitest";

vi.mock("@sveltejs/kit", () => ({
	redirect: (status: number, location: string) => {
		throw Object.assign(new Error(location), { status, location });
	},
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("#lib/settings/settings-data.js", () => ({
	pullShellSettings: async () => ({ ui: { marker: "ui" }, appAudio: null }),
}));

import { LOCAL_DOWNLOADS } from "#lib/downloads/tokens.js";
import { MemoryCache } from "#lib/services/cache.service.js";
import { CACHE, Container } from "#lib/services/index.js";
import { load } from "./+layout.server.ts";

function call(profileId: number | null, pinEnabled = false, onDisk = false) {
	const services = new Container("test")
		.provide(LOCAL_DOWNLOADS, onDisk ? ({} as never) : null)
		.provide(CACHE, new MemoryCache());
	return load({
		locals: {
			session: { accountKey: "u" },
			profileId,
			nuvio: { withFetch: () => ({}) },
			services,
		},
		parent: async () => ({
			profiles: [{ profile_index: 2, pin_enabled: pinEnabled }],
		}),
		fetch,
		url: new URL("http://localhost/library"),
	} as never);
}

describe("(app) layout", () => {
	it("loads the selected profile", async () => {
		await expect(call(2)).resolves.toMatchObject({
			profile: { profile_index: 2 },
			ui: { marker: "ui" },
		});
	});

	it("says whether downloads go to a folder on this computer", async () => {
		await expect(call(2)).resolves.toMatchObject({ downloadsOnDisk: false });
		await expect(call(2, false, true)).resolves.toMatchObject({
			downloadsOnDisk: true,
		});
	});

	it("sends a missing or PIN-locked profile to the picker", async () => {
		const picker = { status: 303, location: "profiles?redirectTo=%2Flibrary" };
		await expect(call(null)).rejects.toMatchObject(picker);
		await expect(call(3)).rejects.toMatchObject(picker);
		await expect(call(2, true)).rejects.toMatchObject(picker);
	});
});
