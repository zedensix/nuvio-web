import * as v from "valibot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "#lib/services/cache.service.js";
import { uiSettingsSchema } from "./ui-settings.ts";

const state = {
	settingsPull: vi.fn(),
	settingsReplace: vi.fn(),
	homeReplace: vi.fn(),
	cache: new MemoryCache(),
};

vi.mock("$app/server", () => ({
	command: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: { services: { get: () => state.cache } }, fetch },
		nuvio: {
			settings: { pull: state.settingsPull, replace: state.settingsReplace },
			homeCatalog: {
				replace: (...args: unknown[]) => state.homeReplace(...args),
			},
		},
		profileId: 3,
		accountKey: "u",
	}),
}));

import { saveHomeLayout, saveUiSettings } from "./settings.remote.ts";
import * as data from "./settings-data.ts";

const defaults = v.parse(uiSettingsSchema, {});

beforeEach(() => {
	state.settingsPull = vi.fn(async () => []);
	state.settingsReplace = vi.fn(async () => undefined);
});

describe("saveUiSettings", () => {
	it("merges the ui block into the existing blob and stamps the version", async () => {
		state.settingsPull = vi.fn(async () => [
			{ settings_json: { keepThis: true, ui: { accent: "old" } } },
		]);

		const next = { ...defaults, accent: "blue" as const };
		const out = await saveUiSettings(next);

		expect(out).toEqual(next);
		expect(state.settingsReplace).toHaveBeenCalledWith({
			p_profile_id: 3,
			p_platform: "web",
			p_settings_json: { keepThis: true, ui: next, uiVersion: 1 },
		});
	});

	it("drops the cached shell settings once written", async () => {
		const forget = vi.spyOn(data, "forgetShellSettings");
		await saveUiSettings(defaults);
		expect(forget).toHaveBeenCalledWith(state.cache, "u", 3);
	});

	it("still writes when there's no prior blob", async () => {
		await saveUiSettings(defaults);
		expect(state.settingsReplace).toHaveBeenCalledWith(
			expect.objectContaining({
				p_settings_json: { ui: defaults, uiVersion: 1 },
			}),
		);
	});
});

describe("saveHomeLayout", () => {
	// Its own platform namespace: the web layout must not change what the
	// mobile or TV app shows on its home screen.
	it("replaces the home layout under the web platform", async () => {
		state.homeReplace = vi.fn(async () => undefined);
		const layout = { rows: ["a|movie|top"], hidden_catalogs: ["b|series|x"] };
		expect(await saveHomeLayout(layout)).toEqual(layout);
		expect(state.homeReplace).toHaveBeenCalledWith({
			p_profile_id: 3,
			p_platform: "web",
			p_settings_json: layout,
		});
	});

	it("caches the new layout, and drops it when Nuvio refuses it", async () => {
		const layout = { rows: [], hidden_catalogs: ["a|movie|x"] };
		state.homeReplace = vi.fn(async () => undefined);
		await saveHomeLayout(layout);
		expect(await state.cache.get("home-layout:u:3")).toEqual(layout);

		state.homeReplace = vi.fn(async () => {
			throw new Error("down");
		});
		await expect(saveHomeLayout(layout)).rejects.toThrow("down");
		expect(await state.cache.get("home-layout:u:3")).toBeUndefined();
	});
});
